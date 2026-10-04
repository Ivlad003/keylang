**Scope: external packages and dependencies in keylang (dependency modelling for AI completion and auto-import)**

The short answer: an external package exists only as an opaque module `external.<segment>`, one per package. Its exported symbols are not modelled anywhere. A spec file has no import, `uses`, front-matter or dependency-list construct. So symbol completion and auto-import both need new data. For auto-import, the only form that fits the current grammar is inserting a `planned` line.

Fact labels:
- **[impl]**: checked in code or tests.
- **[run]**: I reproduced it with `node bin/keylang.js check` on a scratch repo.
- **[doc]**: stated only in docs.
- **[hyp]**: my inference.

---

## 1. How an external package is represented

**ID form [impl].**
- The ID is `external.<segment>`, where the segment is the package name without `@` and with the first `/` turned into `-`, then sanitised by `layerName` (src/graph.ts:869-872).
  - Examples: `@anthropic-ai/sdk` → `external.anthropic-ai-sdk`, `lodash.get` → `lodash_get`.
- When two packages sanitise to the same segment, one keeps it and the others get `-2`, `-3`… with a warning (src/graph.ts:880-907, tests/analyzer.test.ts:499).
- Node built-ins all become one module, `external.node` (src/graph.ts:366).
- Rust toolchain crates `std`, `core`, `alloc`, `proc_macro` and `test` are external (src/rust-imports.ts:21, :82-83).
- Package subpaths are dropped: `zod/v4` → `zod` (src/imports.ts:369-372).
- `external` is a synthetic layer (src/config.ts:72). Its name is reserved for user layers (src/config.ts:79). References to `external` itself are never K001 (src/resolve.ts:203-204, :250).

**Two sources [impl].**
1. **Imports → a snapshot node.**
   - A bare specifier is external only when it is declared in a `package.json` or installed in `node_modules` between the file and the root. Otherwise it is an unresolved import (src/imports.ts:88-92, :255-263, :266-281).
   - Python: any top-level name not found in the repository root or `src/` is external, so stdlib names like `os` count too (src/python-imports.ts:42-47).
   - Rust: a key from `[dependencies]`, `[dev-dependencies]` or `[build-dependencies]`, including `package =` renames and `[target.*]` tables (src/rust-imports.ts:89-90, :176-190).
   - The node is created by `ensureModule(..., EXTERNAL, …)` with `members: "opaque"` (src/graph.ts:249, :365-369). Its `comment` holds the original package name (src/graph.ts:368).
2. **Manifests → a known ID, but no node.**
   - `declaredExternalIds(root)` reads the keys of `package.json` (`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`) and of `Cargo.toml` (src/declared-packages.ts:12-13, :16-37).
   - The resolver uses them only to suppress K001 (src/resolve.ts:38-39, :253; src/analyze.ts:97).
   - They add no snapshot node or map line (tests/rules-area.test.ts:410-470; docs/format.md:421, :633).
   - Python manifests are not read (src/declared-packages.ts:2-3).

**In the map [impl].**
- `keylang/map/external.md` is generated as `- external` followed by `  - module <segment> <!-- <pkg> -->` lines (keylang/map/external.md:5-16; src/emit.ts:260).
- Each importing module gets a line `- <alias> external.<seg>` (src/emit.ts:262, :292-299). The alias comes from the binding or the module name, avoiding position keywords (src/graph.ts:190, :385-399). Example: `- smol-toml external.smol-toml` (keylang/map/map.md:27).
- External modules are skipped in README counts and the explained map (src/emit.ts:160, :205).
- The documentation comment of a layer or external module is always `null` (docs/format.md:798).

**Exported symbols (e.g. `zod.object`) are not modelled [impl].**
- An external module has no `fns` or `types` and is opaque.
- Calls into it are counted in `stats.callsExternal` and create no edges (src/graph.ts:179, :625, :656-658, :680).
- A name imported from an external module gets export target `none` (src/graph.ts:864; src/exports.ts:24).
- The imported names exist only in `FileFacts.imports[].bindings` (`named` with its `imported` name, src/extract/facts.ts:63-69) and in the raw text of the edge. They are not structured in the snapshot.

**How member references behave:**
- `step external.zod.object` when zod is imported → `ID unverified … opaque module` [run; also tests/cli.test.ts:1384-1392].
- `step external.pg.Pool` when pg is only declared in the manifest → **K001** [run]. The known-package check is an exact ID match (src/resolve.ts:253), and a declared-only package has no declaration to act as an opaque prefix.

## 2. Where a spec author can reference a dependency

The grammar has no `import`, `uses` or front-matter construct.
- A heading is only `heading = "#" " " kind [ " " name ] ; kind = "map" | "rules" | "flow" | "wiring" ;` (docs/format.md:816-817).
- A `---` line is prose, because a list item needs `-` followed by a space (docs/format.md:21, :823).
- The only list of dependencies is the map's `<alias> <id>` line under a module.

Grammar, quoted from docs/format.md Appendix A:
- :837 `under-module = "module" | "fn" | "type" | "event" ;` — anything else under a module is a dependency.
- :853 `dep-args = alias id ;`
  - Table row :333: "`<alias> <id>` під модулем | два токени | оголошує `module.alias`; `id` — посилання" (under a module; two tokens; declares `module.alias`, the `id` is a reference).
- :855 `calls-args = ( "calls" | "reads" ) id ( "," id )* ;`
- :857 `allow-args = ( "allow" | "deny" ) id id ;`
  - Row :336 says "≥ 2 ID … ID fn, type, event чи аліаса залежності — K005" (at least 2 IDs; a fn, type, event or dependency-alias ID is K005).
- :863 `step-args = ( "trigger" | "step" ) id ;`
- :864 `planned-args = "planned" ( "fn" | "module" | "type" | "event" ) id [ signature ] ;`
  - `planned` is allowed only at the top of a flow section (:297, :834, :551).
- :859 `rule-module-args = "module" id ;` and :870 `wire-args = ( "wire" | "compose" ) id ;`
- Every reference can also be written as a link `[id](href)` (:248).

Where `external.*` works today:
- **Rules:** `deny lang external.web-tree-sitter` (keylang/rules.md:18-22). The pattern `deny infra external` + `allow infra external.pg` is tested (tests/rules-area.test.ts:419). A dependency into the unordered `external` layer is allowed unless a `deny` covers it (docs/format.md:546; design.md:130).
- **Flow steps:** the documented pattern for an integration not yet in the code is `planned module external.<pkg>` plus `step external.<pkg>` (docs/format.md:709).
  - Static proof is a resolved import from the parent fn's own module (src/flows.ts:383, :482-491): "imported by `app.pay`", otherwise "no import of … from …".
  - K202 appears once any import creates the node (tests/cli.test.ts:1820-1851).
- **Hand-written `<alias> <id>` lines:** they mean something only without code.
  - With code, `check` replaces the generated `map/` files with a fresh render (docs/format.md:539).
  - A hand-written map that repeats a module from the code gives `K002 duplicate ID app.a` [run].

## 3. What "auto-import" could mean, checked against the current contracts

**(a) Insert `planned <kind> <id>` for an unknown ID — consistent.**
- The K001 message already says "declare `planned` if this is an intention" (src/resolve.ts:258). `Diagnostic.target` exists so that a `planned` line can match it (src/diag.ts:59-60). The filter works across all files (src/assess.ts:67-72). The draft prompt already teaches this (src/draft-llm.ts:42, :53, :69).
- Constraints:
  - It can only be inserted at the top of a flow section (a `flow`/feature file), never in `rules.md` or the map.
  - A `planned fn`, `type` or `event` inside `allow`/`deny` is K005 `scope` (docs/format.md:547). Only `planned module` makes sense there.
  - A second declaration of the same ID is K002 (src/resolve.ts:154-156).
- For external packages:
  - `planned module external.<pkg>` is the canonical form (docs/format.md:709).
  - It is unnecessary when the package is already declared in a manifest (src/resolve.ts:253).
  - [run] `planned fn external.zod.object …` gives no diagnostic and never K201/K202: the opaque module has no members to compare against. Symbol-level `planned` for packages is effectively unchecked.

**(b) Auto-add an `allow` rule (or a declared dependency) when a step uses a package — changes policy, inconsistent.**
- Rules are default-allow, so an `allow` does something only when it beats a `deny`. Auto-adding one weakens a rule.
- `keylang agents` denies Claude `Edit`/`Write` on `keylang/rules.md` and `rules.baseline.md` (docs/tools.md:78): rules belong to humans by design.
- At most, offer it as an explicit, human-confirmed quick-fix in the TUI.

**(c) Insert into a `uses`/`deps` list — needs new syntax.**
- No such construct exists (§2). The map's `<alias> <id>` lines come from the snapshot (src/emit.ts:262, :292-299).
- A dependency written into a spec would be a declared edge without evidence. That goes against "syntactic analysis gives no grounds to invent confirmed edges" (AGENTS.md) and against the snapshot-decides model (docs/format.md:539). It would be a new language construct and needs a new format edition (docs/format.md:711-722).

**(d) Add the package to `package.json` / `Cargo.toml` — fits the contract but works outside the spec.**
- It makes `external.<seg>` known: no K001, no node, no K202 until an import exists (docs/format.md:421; src/declared-packages.ts:16-37).
- Downsides:
  - It edits the project manifest, which is code, not spec.
  - A real version needs the registry (network), and local checks must work offline.
  - It has no effect for Python (not read) and it does not install anything.
  - [hyp] It fits as an explicit TUI action ("add dependency"), not as automatic behaviour.

**(e) Auto-import in the source-code sense** (adding `import { z } from "zod"` to a `.ts` file) is outside the spec language entirely. [hyp] It would be a code action over source files. I have not checked whether the TUI edits source buffers; that belongs to the TUI area.

## 4. Library symbol index, and what `declared-packages.ts` knows

- **No index of library exports exists [impl].**
  - `.d.ts` files are explicitly not sources (docs/format.md:786).
  - `node_modules`, `venv`, `site-packages` and `target` are skipped (src/config.ts:82; src/declared-packages.ts:32).
  - The resolver only checks that `node_modules/<pkg>` exists, or reads workspace package entries (src/imports.ts:100-124, :275). There is nothing for Cargo registries.
  - An index would be new.
- **What `declared-packages.ts` knows:** only a `ReadonlySet<string>` of IDs.
  - Just the key names (`Object.keys`, src/declared-packages.ts:72), plus the Cargo `package =` rename (:93-95).
  - No versions, no path to the declaring manifest, no dev/peer/optional distinction, no collision suffixes. Two colliding packages share one ID here, while the graph gives one of them `-2`.
  - Invalid JSON or TOML throws, naming the file and field (:40-58, :66, :82).
  - The set is not kept on `Analysis` (src/analyze.ts:41-48, :97). So LSP/TUI completion cannot see declared-only packages today.
- **Current completion [impl]** (src/lsp-features.ts:552-601):
  - It offers snapshot `module`/`fn`/`type` nodes after `calls`, `reads`, `emits`, `allow`, `deny`, `then` and `module`, so imported `external.*` modules appear. Declared-only packages do not.
  - After `step` and `trigger` it offers only `fn` nodes (:552, :590-591). The valid `step external.<pkg>` is never suggested.
  - Candidates are filtered by `deny` from the enclosing module (:592). No package members are offered.
- **[hyp] Risks of a real index:**
  - A TS `.d.ts` index from local `node_modules` would stay offline. `snapshotId` already hashes whether and where each package is installed (docs/format.md:786), and would have to hash the `.d.ts` content too.
  - A Cargo index needs `~/.cargo/registry` outside the repo, which clashes with "paths independent of the home directory".
  - Python has no manifest input at all.
  - If the index made external modules `members: complete`, `external.zod.missing` would switch from `unverified` to K001. That is a semantic change to Р13 / design.md:63. Keeping the modules opaque and using the index only for completion avoids it.

## 5. Relevant diagnostics (src/diag.ts:5-42; docs/format.md:504-522)

| Code | Relevance to dependencies | Where |
|---|---|---|
| K001 | Dangling reference; the one "did you mean" hint only looks at map declarations, so declared-only packages are never suggested [run: `external.pgx` had no hint]; `target` carries the ID | src/resolve.ts:94-110, :252-259; src/diag.ts:59-60 |
| K002 | Duplicate ID or `planned`; also a hand-written map module that repeats the generated one | src/resolve.ts:185-201 |
| K005 `reason: scope` | fn, type, event or dependency alias used in `allow`/`deny` | src/diag.ts:47; docs/format.md:547 |
| K102 | Dependency forbidden by `deny`, including on `external.*` (keylang/rules.md:18-22) | docs/format.md:515 |
| K201 / K202 | `planned` differs from / matches the implementation; for `external.<pkg>`, K202 only after an import | src/flows.ts:625-649; docs/format.md:421, :709 |
| K302 | A module (and so a package) cannot be a `wire` factory or dependency | docs/format.md:703 |

There is **no code for an undeclared external package**.
- A bare import that is neither declared nor installed is a coverage gap `unresolved-import` (src/imports.ts:262; src/graph.ts:370-374). It turns rule verdicts into `unverified` rather than producing a K-code.
- A package installed but not declared is still treated as external (src/imports.ts:88-92).
- A member of an imported package gives the `unverified` verdict "opaque module", not a diagnostic (src/resolve.ts:260-267).

The scratch repo I used for the [run] checks is `/tmp/claude-1000/-home-kosmodev-pet-project-keylang/84bcd598-07f5-4d0f-99b0-ee5f051b0245/scratchpad/ext1`. No repository files were changed.