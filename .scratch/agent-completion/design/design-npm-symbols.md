The design below is ready to implement. I changed no repository files. The throwaway probes are in `/tmp/claude-1000/-home-kosmodev-pet-project-keylang/84bcd598-07f5-4d0f-99b0-ee5f051b0245/scratchpad/probes/`.

# npm symbol index for completion, hover and signature help: design

## 0. Critical path

1. **The deps slice has to land first (blocker).**
   - The index needs declared packages with their npm names and final IDs, including the `-2` collision suffixes. That means something like `Analysis.packages: DeclaredPackage[]`.
   - Today `declaredExternalIds()` returns only a `Set` of IDs, built from `Object.keys` (`src/declared-packages.ts:16-37`, `:72`). Nothing is kept on `Analysis` (`src/analyze.ts:41-48`, `:97`).
2. **Assumption 4 is confirmed, and it is a precondition.**
   - The resolver only suppresses K001 on an exact ID match: `if (knownExternal.has(r.target)) continue;` (`src/resolve.ts:253`).
   - I re-ran scratchpad `ext2`, where `pg` is declared and `planned module external.pg` exists. It still gives `K001 dangling reference external.pg.Pool` at `keylang/flows/g.md:5:10`.
   - Without a prefix match that reports "unverified", accepting a symbol of a declared-only package produces K001.
3. **The index is only an editor aid.**
   - It is not in `snapshotId` or `.keylang/index.json`, and `check`/`map` never read it.
   - The layering already prevents misuse: `check` sits below `map` (`keylang/rules.md:14`), so the resolver cannot import the index.
4. **No new syntax, CLI flags, config keys or diagnostics.** The contract changes are in LSP/TUI result shapes plus one new cache file.

## 1. Facts I checked in the code

- **The web-tree-sitter TypeScript grammar parses `.d.ts` without errors.** That covers `ambient_declaration`, `function_signature`, `import_alias` (`export import A = N.B`), `export =`, `export as namespace`, `declare module 'x' {…}` and `declare namespace` (probe `p2.ts`). `grammarFor` maps `.d.[cm]ts` to `typescript` (`src/extract/treesitter.ts:78-84`).
- **`extractTs` is not suitable for typings.** It drops:
  - `export import` (no row);
  - the type of `export const x: T` (a row only, no decl or signature);
  - members of `declare module "pkg" {}` and `declare namespace` (`src/extract/ts.ts:249-258`).

  With it, web-tree-sitter would show 0 symbols and @types/ws would lose 15 names. It also computes calls, fingerprints and value refs that the index does not need. So the index gets its own top-level reader.
- **Code worth reusing:**
  - `resolveExports()` (`src/exports.ts:79`): plain data in and out, safe on cycles, handles `export *` ambiguity.
  - `signature()` / `typeSignature()` (`src/extract/ts.ts:1364`, `:1373`; not exported yet).
  - `blockCommentBody` / `jsdocDescription` (`src/extract/doc-comments.ts:16`, `:34`) and `briefOf` (`src/brief.ts:16`).
  - `isSegment` (`src/parser.ts:868`) and `withTree` (`src/extract/treesitter.ts:48`).
- **`.d.ts` files are not snapshot sources** (`docs/format.md:786`; `src/imports.ts:181-183`). `node_modules` is never indexed (`src/config.ts:81`).
- **Fact cache:** `.keylang/cache/facts.json`, written only by `keylang map` (`src/fact-cache.ts:1-8`, `src/map.ts:65,75`). The cache key includes a hash of every file in `src/extract/` (`src/map.ts:232-238`).
- **Writes today:**
  - The TUI already writes `.keylang/stats.json` through `safeWrite(..., {under: ".keylang"})` (`src/stats.ts:41`).
  - The LSP is documented as writing nothing (`docs/tools.md:104`).
- **Completion:** `completions()` is shared by the LSP (`src/lsp.ts:293`) and the TUI (`src/tui/app.ts:1121`).
  - Word scan with dots: `lsp-features.ts:570-576`. Symbol context sets: `:552-553`.
  - Results are sorted by label (`:605`); nothing is capped.
  - `describe()` (`:242-254`) feeds hover (`:275`), definition (`:296`) and signatureHelp (`:310-321`).

## 2. Probe results

Measured on an i5-1145G7 with Node 24.20, running the TS sources directly (the `build.ts` prototype, which follows the design below).

| Set | Packages | Typings files | KB | Symbols | Time |
|---|---|---|---|---|---|
| runtime deps | 8 | 121 | 433 | 429 | 362 ms warm, +17–38 ms WASM/grammar init |
| all declared (deps + dev + optional) | 18 | 132 | 1363 | 2032 | 1126–1251 ms (typescript 411 ms, zod 242–381 ms) |
| runtime deps, following every import instead of only re-export edges | 8 | 223 | 1737 | 429 | 1214 ms (rejected) |
| runtime deps, also every explicit `exports` subpath | 8 | +208 | +1539 | – | +1.3 s (rejected for V1) |

- **Longest single parse** (synchronous, so it blocks the event loop): `typescript.d.ts`, 574 KB, 151 ms. Other files: zod `schemas.d.cts` 74 ms, anthropic `messages.d.mts` 150 KB 29 ms.
- **Cache:** 208 KB of JSON for the 18 packages, `JSON.parse` 6 ms; hashing 574 KB takes 2.8 ms.
- **Signature length:** p50 22 / p90 69 / p99 188 / max 432 characters, so the display cap is 160.
- **ID segments:** all 2032 names pass `isSegment`.
- **Checked against the TypeScript checker** (`oracle.ts`, using `ts.resolveModuleName` in Bundler mode plus `getExportsOfModule`):
  - The same entry file was chosen for all 8 deps (ws resolves to `@types/ws/index.d.mts`, MCP SDK to none).
  - The same export sets for zod 303, ws 19, smol-toml 9, eventsource-parser 7, web-tree-sitter 25, anthropic 36, @vscode/tree-sitter-wasm 26, @xterm/xterm 37, mdast 13, decibri 28 and fast-check 227 (the `___x` vs `__x` difference is TypeScript's escaping).
  - The only gap: `typescript` 1266 of 1269, because the reader does not handle dotted nested namespaces (`namespace ts.server`).
  - The TS API route itself costs 754 ms to load plus 769 ms for zod alone, and would make `typescript` (about 23 MB) a runtime dependency.
- **Packages this repo depends on:**
  - `@modelcontextprotocol/sdk`: its `exports["."].types` points at a missing file, so V1 offers package level only.
  - `@types/node`: only `/// <reference>` lines, so 0 symbols (Node built-ins are `external.node`).

## 3. Design

### 3.1 Where the code goes (layers)

| File | Layer | Role |
|---|---|---|
| `src/extract/dts.ts` (new) | extract (the existing `src/extract/**` glob, `keylang.json:10`) | Pure: declaration-file text → `DtsFacts`. Uses tree-sitter. |
| `src/package-symbols.ts` (new) | map (add to the list at `keylang.json:9`) | Selects packages, resolves typings entries, walks the closure, runs `resolveExports`, holds the cache and the `PackageIndex` runtime. |
| `src/lsp-features.ts` | features | Reads a `PackageTable` from `Workspace`. Imports types only from package-symbols. |
| `src/lsp.ts` | cli | Owns an in-thread `PackageIndex` (`persist: false`). |
| `src/tui/app.ts`, `background.ts`, `analysis-worker.ts` | tui | Own a `PackageIndex` (`persist: true`) that builds in the SnapshotWorker. |

- No deny rule is touched: `deny tui extract` holds because the TUI imports the map-layer module.
- `lang`, `check` and `base` never import it, so the core stays free of tree-sitter.
- `src/extract/ts.ts`: only add `export` to `signature` and `typeSignature`; behaviour does not change.

### 3.2 Which packages, and which typings entry

- **Input:** `DeclaredPackage` entries (from the deps slice) with the npm ecosystem, where the name does not start with `@types/`.
  - Cargo and Python stay package level only.
  - A package that is installed but not declared is never indexed.
- **Where the package lives:** the nearest `node_modules/<name>` walking up from the declaring manifest's directory. This mirrors `ImportResolver.locate` (`src/imports.ts:104-121`).
  - A package whose directory resolves inside the repository is a workspace package, which is internal, so it is skipped.
- **`typingsEntry(dir)`** is deterministic and matched TS on every probed package:
  1. **`exports` is present.**
     - The target is `exports` itself when it is a string or array, or when none of its keys starts with `.` (the smol-toml shape). Otherwise it is `exports["."]`.
     - If there is no `"."` entry, the package has no root typings; do not fall back to `types`.
     - Walk the object keys in order and take the first key in `{types, import, node, default}` whose target resolves, recursing into nested objects and arrays.
     - Unknown conditions are skipped (`@zod/source`, `browser`, `source`, `require`). If nothing resolves, retry with `{types, require, node, default}`.
  2. **No `exports`:** try `types`, `typings`, then `module`, `main`, then `index`.
  3. **Mapping a target to a declaration file:**
     - `.d.[cm]ts` is used as is.
     - `.js`, `.mjs`, `.cjs` → `.d.ts`, `.d.mts`, `.d.cts`.
     - `.ts`, `.mts`, `.cts` → the matching `.d.*` (needed for eventsource-parser's `'./errors.ts'`).
     - No extension → `.d.ts`, then `/index.d.ts`.
     - The result must be a file inside the package directory.
  4. **Nothing found:** use `@types/<scope__name>`, but only when it is declared as well (decision 4) and installed. Run the same steps on it.
  - `typesVersions` is ignored.

### 3.3 `src/extract/dts.ts`

```ts
export type DtsKind = "fn" | "class" | "type" | "value" | "namespace";
export interface DtsDecl {
  name: string; kind: DtsKind;
  signatures: string[];        // 1..5, file order (overloads)
  overloads: number;           // total count
  callable: boolean;           // fn, or a value annotated with a function_type
  doc: string | null;          // briefOf(jsdocDescription(...)), capped 160
  line: number;                // 1-based
}
export type DtsExport =
  | { name: string; local: string }                         // decl, export {a as b}, export import b = N.a, export =
  | { name: string; from: string; imported: string }         // export {a as b} from
  | { name: string; from: string; namespace: true };         // export * as b from
export interface DtsFacts {
  decls: DtsDecl[]; exports: DtsExport[]; stars: string[];
  imports: { local: string; from: string; imported: string | null }[];  // null: import * as
  namespaces: { name: string; members: DtsDecl[] }[];   // one level; same-name blocks merged
  parseError: boolean;
}
export function readDeclarations(text: string, moduleName: string | null): Promise<DtsFacts>;
```

Rules (each one is backed by a probe case):
- **Top-level only.** Handle `export` and `declare` wrappers, `export { … } [from]`, `export * [as ns] from`, `export default <id>`, and `export import A = N.B`. Ignore `export as namespace`, `declare global` and a bare `export {}`.
- **`declare module "<moduleName>" { body }`** (web-tree-sitter, @xterm):
  - The body counts as the module's top level.
  - Its members are exported implicitly unless the body contains an `export { … }` clause, as TypeScript does.
- **`export = X` with `namespace X`** in the same file (@types CommonJS style, typescript): the namespace's members become named exports.
- **Kinds:**
  - Declarations with the same name and kind are overloads.
  - When a value and a type share a name (`export const X: typeof S; export interface X`), the value's kind wins.
- **Signatures:**
  - fn: `signature()`.
  - type: `typeSignature()`.
  - class: `new (<first constructor params>)`, otherwise the heritage clause.
  - value: its annotation.
  - Whitespace is collapsed and each string is capped at 160 characters with `…`.

### 3.4 Building one package (`src/package-symbols.ts`)

```ts
export interface PackageSymbol {
  name: string;                 // export name; "ns.member" for one namespace level
  kind: DtsKind; callable: boolean;
  signatures: string[]; overloads: number; doc: string | null;
  file: string; line: number;   // typings file relative to root, POSIX (for hover/definition)
}
export interface PackageSymbols {
  package: string; version: string | null;          // runtime package.json
  typings: { package: string; version: string | null } | null;  // "zod" or "@types/ws"
  state: "indexed" | "partial" | "no-typings" | "not-installed";
  reason?: string;                                    // partial / no-typings cause
  symbols: PackageSymbol[];                           // sorted by compareText(name)
}
export interface IndexedPackage { symbols: PackageSymbols; inputs: { manifests: Record<string, string>; files: Record<string, string> } } // sha256, keys sorted
export function indexPackage(root: string, pkg: DeclaredPackage): Promise<IndexedPackage>;
```

- **Closure.** Breadth-first from the entry file. Follow only specifiers that feed the exports:
  - `export *`, `export … from` and `export * as`;
  - an `import` whose local binding an export row names (zod `import * as z; export { z }`, smol-toml `import { parse }; export { parse }`).
  - Only relative paths are followed, and they must stay inside the package directory.
  - `export * from "<bare>"` is not followed: the package becomes `partial` with the reason "re-export from package X".
  - Yield with `setImmediate` between files.
- **Resolution.** Each file becomes a `ModuleExportsInput` (symbols `file#name`; namespace targets are modules), then goes through `resolveExports()`. Take the entry module's entries.
  - Skip `default` and `*`.
  - Add one level of members for module namespaces (from `entries()` of the target) and for `namespace` declarations.
  - Names that fail `isSegment` are dropped.
- **Limits** (constants):

  | Limit | Value | Largest seen in probes |
  |---|---|---|
  | files per package | 256 | 94 |
  | bytes per package | 4 MiB | – |
  | bytes per file | 2 MiB | 574 KB |
  | symbols per package | 5000 | 1266 |
  | members per namespace | 500 | – |

  Going over any limit marks the package `partial` with a reason.
- **ID:** `${pkg.id}.${symbol.name}`, for example `external.zod.object`, `external.zod.coerce.string`, `external.ws.WebSocketServer`.

### 3.5 Cache: `.keylang/cache/packages.json`

```json
{"schema":1,"builder":"<sha256 of dts + package-symbols code + grammarVersions()>",
 "packages":{"zod":{"dir":"node_modules/zod","manifests":{"node_modules/zod/package.json":"<sha>"},
   "files":{"node_modules/zod/index.d.cts":"<sha>", "...": "..."},"result":{ "...": "PackageSymbols" }}}}
```

- **Key:** npm name. The ID is attached when the table is built, so a change in collision suffixes does not invalidate anything.
- **An entry is valid when** the builder version matches, the manifests' SHAs match (runtime and @types), and every closure file's SHA matches. Re-hashing about 1.4 MB costs roughly 8 ms. An entry of the wrong shape is dropped, as in `fact-cache.ts:30-39`.
- **Deterministic:** sorted keys, no timestamps.
- **Who writes it:**
  - Only the TUI, via `safeWrite(root, ".keylang/cache/packages.json", text, { under: ".keylang" })` inside try/catch. An unwritable directory keeps the index in memory only.
  - The LSP only reads it, which keeps `docs/tools.md:104`.
  - `check`, `map` and `map --check` never touch it.
- **Freshness in a running session:** an entry in memory is re-checked by the manifest SHA on every `refresh`. A typings file edited in place without a version bump is picked up on the next process start.

### 3.6 Runtime

```ts
export type PackageTable = ReadonlyMap<string /* external.<seg> */, PackageSymbols | "pending">;
export type BuildPackage = (root: string, pkg: DeclaredPackage) => Promise<IndexedPackage>;
export class PackageIndex {
  constructor(root: string, options: { persist: boolean; build?: BuildPackage }); // default build: indexPackage
  refresh(packages: readonly DeclaredPackage[]): Promise<void>; // coalesces; builds changed packages one by one, in name order
  table(): PackageTable;
  close(): void;
}
```

**LSP (`src/lsp.ts`)**
- `initialize` (`:306`) creates the index.
- `analysis()` (`:197-211`): on success, `void this.packages.refresh(analysis.packages)`. This is not added to `pending`, so exit does not wait for it.
- `current()` (`:217`) passes `this.packages.table()` into `workspace(...)`.
- `drain()` (`:140`) calls `close()`.
- Completion (`:292-293`) returns the `{isIncomplete, items}` that `completions()` now produces.

**TUI**
- `AppOptions` (`src/tui/app.ts:50`) gets `packageBuild?: BuildPackage`.
- `terminal.ts:116` and `web.ts:169` pass `worker.packageSymbols`.
- `SnapshotWorker` (`background.ts`) and `analysis-worker.ts` handle a new message `{id, kind: "packages", root, pkg}`. If the worker cannot start, the build runs in-thread.
- `adopt()` (`app.ts:360`) calls `this.track(this.packages.refresh(analysis.packages).then(() => this.state.completion && this.complete(false)))`, so `idle()` waits for it and tests stay deterministic.
- `live()` (`:511-518`) passes the table. `complete()` (`:1121`) uses `.items`. `close()` (`:253`) calls `packages.close()`.

**Completion never blocks.** Features only read a snapshot of the table. A package still building is `"pending"`, and completion reports `isIncomplete: true`.

### 3.7 Features (`src/lsp-features.ts`)

**Plumbing**
- `Workspace` (`:40-45`) gains `packages: PackageTable`. `workspace()` (`:47`) takes a 4th parameter that defaults to `new Map()`.
- `CompletionItem` (`:533`) gains `documentation?: string`. `COMPLETION` (`:549`) gains `variable: 6` and `class: 7`.
- `completions()` now returns `{ isIncomplete: boolean; items: CompletionItem[] }`.

**When symbols are offered**
- The keyword is in `SYMBOL_ARGS = {step, trigger, calls, reads}`.
- `typed` matches `^(external\.[^.\s]+)\.((?:[^.\s]+\.)?)[^.\s]*$`.
- `m[1]` is a key of the table.

**Rules**
- **Pending:** no symbol items, and `isIncomplete: true`.
- **Denied:** if `from` is set and `blocksDependency(spec, from, m[1], …)` holds, no items. This is one call per package, not per symbol.
- **Nesting:** with `m[2] === ""`, offer top-level symbols (names without a dot). With `m[2] === "ns."`, offer `ns.*` members.
- **After `step`/`trigger`:** only `callable || kind === "namespace"` (namespaces are how you drill down).
- **Item shape:**

  | Field | Value |
  |---|---|
  | `label` | the full ID |
  | `kind` | fn 3, class 7, type 22, value 6, namespace 9 |
  | `detail` | `signatures[0]` plus ` (+N overloads)` |
  | `labelDetails.description` | the npm name |
  | `documentation` | `doc` |
  | `sortText` | `3<id>` |
  | edit | the existing `replacing()` |

- **Payload:** while in symbol mode, the snapshot and `planned` candidates are narrowed on the server to `label.startsWith(typed)`. The visible result is the same and the payload is smaller.
- **Auto-import (decision 2):** symbol items carry no `additionalTextEdits`. A declared package already resolves without K001 once the resolver change from §0 lands, so a `planned` line is never needed for them.

**Hover, signature help, definition**
- `describe()` (`:242`) gets a branch after the `planned` check and before `index.lookup`. It returns kind, signatures, doc, `file:line`, and the state `"<pkg> <version> typings, not checked"`.
- `hover()` (`:275`) adds the doc line. It keeps the verdict lines as they are, so the "unverified, opaque module" line still appears.
- If the package is ready but the name is missing, hover adds `not in <pkg> <version> typings (advisory)`. This is hover only: LSP diagnostics must keep matching `check` (`docs/tools.md:106`).
- `signatureHelp()` (`:310`) returns one entry per overload signature, up to 5.
- `definition()` (`:296`) goes to the typings file and line.

### 3.8 Interaction with the resolver (assumption 4)

- The index is never a source of verdicts or diagnostics.
- `external.<seg>.<name>` stays `unverified`, whether or not the typings list the name, as Р13 requires (`docs/format.md:441`).
- Reasons:
  - typings are not the runtime;
  - subpaths collapse into one ID (`src/imports.ts:369-372`);
  - conditional exports differ per environment;
  - `snapshotId` hashes only whether a package is installed, not its typings (`docs/format.md:786`).

## 4. Public contract changes

- **LSP:**
  - The completion result can have `isIncomplete: true`.
  - New item kinds 6 and 7, and a new `documentation` field.
  - Hover, definition and signatureHelp work for package-symbol IDs; signatureHelp can return several signatures.
  - Capabilities are unchanged (`src/lsp.ts:329-330`).
- **TUI:** the popup shows symbol items, and the TUI writes `.keylang/cache/packages.json`.
- **Unchanged:** config, CLI, MCP, diagnostics, `index.json` and `snapshotId`.

## 5. Documentation changes

| File | Section | Change |
|---|---|---|
| `docs/tools.md` | `keylang lsp` (`:107-108`) | hover, completion and signatureHelp for package symbols; `isIncomplete`; the LSP reads the cache and writes nothing |
| `docs/tools.md` | TUI, "Доповнення…" (`:156`) | symbol items; the cache file and its invalidation |
| `docs/format.md` | §6 (`:421`) and Р13 (`:441`) | one sentence each: typings-based symbols are advisory and never change verdicts |
| `docs/format.md` | §11 (`:786`) | `.d.ts` files are still not sources; the editor index lies outside `snapshotId` |
| `docs/design.md` | §7.1 table (`:435`) | "автодоповнення ID" row now also covers npm symbols |
| new ADR `docs/adr/0008-package-symbols-advisory.md` | – | own tree-sitter reader instead of the TS API (numbers from §2); declared packages only; root entry only; not a verdict source; who writes the cache |
| `CONTEXT.md` | glossary | term "Package symbols", with "Avoid: exports table, import" |

## 6. End-to-end tests (three in total)

**Shared fixture** `tests/package-fixture.ts`, written through `checkoutRepo(t, files)` (`tests/tui-fixture.ts:37-45`). It holds `package.json` with `dependencies` `fake-lib`, `js-only`, `ambient-lib`, `cjs-lib` and `@types/cjs-lib`, plus these packages:

| Package | Shape it tests | Expected symbols |
|---|---|---|
| `node_modules/fake-lib` | `exports["."] = {"@fake/source": …, import: {types: "./dist/index.d.mts"}, require: {types: "./dist/index.d.cts"}}`. `index.d.mts` has `export * from "./schemas.mjs"`, `export { helper as aliased } from "./util.mjs"`, `export * as ns from "./util.mjs"`, a JSDoc'd `make` with 2 overloads, `const pick: (k: string) => number`, `const VERSION: string`, `interface Thing`, `export default make`. `index.d.cts` exports `requireOnly`. | callables `aliased`, `make`, `pick`, plus namespace `ns`; never `requireOnly` |
| `js-only` | `exports` `{".": {default: "./dist/index.js"}}`, and `index.d.ts` re-exports `from "./run.ts"` | `run` |
| `ambient-lib` | `types` → `declare module "ambient-lib" { function start(port: number): void }` | `start` |
| `cjs-lib` | no typings; `@types/cjs-lib` has `declare function cjs(); declare namespace cjs { function connect(url: string): Client } export = cjs` | `connect` |
| `node_modules/undeclared` | installed but not declared | nothing |

The fixture also has `src/app/main.ts`, which imports `make` from `fake-lib`, and a flow containing `- step external.fake-lib.make`.

1. **LSP** (`tests/lsp.test.ts`, the real `keylang lsp --stdio` Session):
   - Completion at `step external.fake-lib.`, polled until `isIncomplete` is false (10 s at most). Exact labels: `aliased, make, ns, pick`.
   - `make` has detail `(name: string) → Thing (+1 overload)`, documentation, and `labelDetails.description` `fake-lib`.
   - `…ns.` gives `ns.helper` and `ns.other`.
   - `js-only`, `ambient-lib` and `cjs-lib` each give their symbol.
   - `external.undeclared.` gives no symbol items and `isIncomplete: false`.
   - Hover on `external.fake-lib.make` contains the signature, `node_modules/fake-lib/dist/index.d.mts:<line>` and `not checked`, and still has the unverified evidence line.
   - signatureHelp gives 2 signatures. definition gives the typings URI and line.
   - After exit there is no `.keylang/cache/packages.json`.
2. **TUI** (`tests/tui.test.ts`, `session()`):
   - Wait for `idle()`, type `step external.fake-lib.ma`, check the popup item and the row text, press Tab, and check the line is `  - step external.fake-lib.make`.
   - The cache file exists. A second session leaves it byte-identical.
   - Append `export declare function added(): void` to `util.d.mts` (version unchanged). A new session offers `ns.added`, which proves the SHA invalidation.
3. **CLI** (`tests/cli.test.ts`):
   - `check --format json` stdout is identical before and after deleting `node_modules/fake-lib/dist`.
   - Neither `check` nor `map --check` creates `.keylang/cache/packages.json`.

Validation after implementing: `npm run typecheck`, `npm test`, `node bin/keylang.js map` (review the diff for the 2 new modules), `map --check`, `check`.

## 7. Risks

- **Accuracy gaps against TypeScript:**
  - dotted nested namespaces (typescript: 1266 of 1269);
  - `typesVersions`;
  - pattern subpaths;
  - `browser`/`worker` conditions;
  - `export *` from another package (reported as partial);
  - global augmentations.
- **Packages with no root typings** (MCP SDK) get no symbols in V1.
- **Event-loop stalls in the LSP:** up to 151 ms per file, once per cache miss. The build runs on the main thread, as `analyze()` already does. The TUI builds off-thread.
- **Fact-cache invalidation:** any edit to `src/extract/dts.ts` changes the extractor code hash (`src/map.ts:232-238`). That means one re-extraction of all facts per edit, not a correctness problem.
- **Lookup above the repository root** mirrors the resolver, so a hoisted monorepo works. A stray `node_modules` in a parent directory could supply the typings (only for declared names).
- **Namespace `z` in zod** re-lists all 303 names as `external.zod.z.*`, visible only after typing `z.`.
- **Deps slice:** if its collision IDs or its resolver change do not land, symbol items are wrong (collision suffixes) or give K001 (declared-only packages).

## 8. Open questions

1. **Subpaths.**
   - Recommended: root only in V1.
   - Alternatives:
     - (a) every explicit `exports` subpath (measured +1.3 s);
     - (b) only the subpaths the code imports. That needs import specifiers the snapshot does not carry today.
2. **May the LSP write the cache?** Recommended: no, keep `docs/tools.md:104`.
3. **Offer `external.x.default`?** Recommended: no.
4. **Namespace depth and exposure.** Recommended: one level; namespaces appear after `step` as drill-down items.
5. **@types fallback.** Recommended: require `@types/x` to be declared too, matching decision 4. The alternative is tsc's "installed is enough".
6. **A config switch to turn the index off.** Recommended: none in V1.
7. **Node built-ins** (`external.node.*` from the `declare module "fs"` typings in @types/node): out of V1.
8. **An MCP `complete` tool** (agents slice): it could reuse `PackageIndex` in the MCP process. Symbols could also feed the agent-provider prompts through `agent-context.ts`.

## 9. Probe files (throwaway)

All in `/tmp/claude-1000/-home-kosmodev-pet-project-keylang/84bcd598-07f5-4d0f-99b0-ee5f051b0245/scratchpad/probes/`:

- `build.ts`: the prototype reader, entry resolution, closure walk and `resolveExports`.
- `oracle.ts`: comparison with the TypeScript checker.
- `run2.ts`: timings.
- `run3.ts`: cache size and hashing cost.
- `run4.ts`: subpath cost.
- `perfile.ts`: per-file parse times.
- `tsapi.mjs`: cost of the TypeScript API route.
- `p1.ts`, `p2.ts`: what `extractTs` misses, and node types of `.d.ts` constructs.