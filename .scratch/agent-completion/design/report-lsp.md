# LSP completion in keylang today: what it offers, what it misses, and where the requested features would attach

Everything below is checked against the code. Items marked "probe" come from in-memory scripts that ran `analyze()` and `completions()` on this repo. They used the overlay only and wrote nothing to the repo. The probe scripts are in the scratchpad: `/tmp/claude-1000/-home-kosmodev-pet-project-keylang/84bcd598-07f5-4d0f-99b0-ee5f051b0245/scratchpad/probe{,2,3}.ts`.

## 1. Completion items offered today

There is one pure function, `completions()` (src/lsp-features.ts:560-606). Two callers use it:
- **LSP:** `textDocument/completion` returns `{isIncomplete:false, items}` (src/lsp.ts:292-293). The server advertises `completionProvider: {triggerCharacters:[" ", "."]}` with no `resolveProvider` (src/lsp.ts:329).
- **TUI:** src/tui/app.ts:1121.

**Positions:**
- **At the start of a list item** (`^\s*-\s+\S*$`, src/lsp-features.ts:566): keywords from `keywordsAt(section.kind, parent?.kind)` (src/lsp-features.ts:579-582; src/parser.ts:124-158). Examples:
  - map top: `layer` plus the rule keywords (`layers allow deny entry module no-cycles`, src/parser.ts:121,131)
  - flow top: `kind trigger step reads emits calls invariant when test planned` (src/parser.ts:135)
  - under `module`: `module fn type event` (src/parser.ts:141)
  - under `step`/`trigger`: `step reads emits calls when test invariant` (src/parser.ts:147)
  - wiring top: `wire`
  - Item shape: `{label, kind:14, sortText:"0<word>", filterText, textEdit}`.
- **After `step` or `trigger`** (`CALLABLE_ARGS`, src/lsp-features.ts:552): only snapshot nodes with `kind==="fn"` (src/lsp-features.ts:593), plus `planned` items whose `decl==="fn"` (src/lsp-features.ts:600).
- **After `calls`, `reads`, `emits`, `allow`, `deny`, `then`, `module`** (`ID_ARGS`, src/lsp-features.ts:553): snapshot nodes of kind `module`, `fn` or `type` (src/lsp-features.ts:593), plus every `planned` item (src/lsp-features.ts:598-604).
  - Docs drift: docs/tools.md:108 leaves `module` out of this list.
- **Deny filter:** for keywords other than `allow`/`deny`, the enclosing module comes from `moduleAround()` (src/lsp-features.ts:589, 640-651). Any candidate for which `blocksDependency(spec, from, id, kindOf, format)` is true is dropped (src/lsp-features.ts:594, 601). `allow`/`deny` arguments are never filtered (src/lsp-features.ts:588-589).
- **Item shape** (interface at src/lsp-features.ts:533-546):
  - snapshot node: `{label:id, kind: 3 fn | 22 type | 9 module, detail?: signature, sortText:"1"+id, filterText:id, textEdit:{range, newText:id}}` (src/lsp-features.ts:595-596)
  - planned item: `detail:"planned <decl> <sig>"`, `labelDetails:{description:"planned"}`, `sortText:"2"+id`, kind 23 for an event (src/lsp-features.ts:602-603)
  - The `textEdit` range covers the whole typed word back to a space or comma, dots included, and skips a leading `[` (src/lsp-features.ts:572-578).
- **Not in the item shape:** no `additionalTextEdits`, `data`, `documentation`, `command` or `insertTextFormat`/snippets. **There is nothing auto-import-like today.**
- **No completion at all** (the keyword is not in either set, so it returns `[]`, src/lsp-features.ts:587):
  - dependency lines `- <alias> <id>` under a module (probe: `- zod ext` gives 0 items)
  - `planned <decl> <id>` (probe: 0 items)
  - `layers`, `entry`, `exports`, `wire`, `test`
- **Signature help** (not completion): the signature of the last dotted ID before the cursor (src/lsp-features.ts:310-319).

**Verified defects in the filtering:**
- After `allow`/`deny`, completion offers fn and type IDs (probe: kinds `[9,3,22]`). Those IDs give **K005** ("`deny` takes layers, modules and ID prefixes…", as the probe showed). It also never offers layers (kind `layer` is excluded at src/lsp-features.ts:593), though they are valid there (docs/format.md:336).
- Layer order (`layers`, K101) is not filtered. Probe: under a `base` module, 133 `cli.*` IDs are offered while keylang/rules.md:14 says `base < … < cli`. Only `deny` filters. docs/tools.md:108 describes deny-only filtering; docs/design.md:461 says "filtered by layer".
- No limit: 1482 items in this repo (probe), always `isIncomplete:false`.

## 2. How the cursor position becomes a context, and where the data comes from

**Context** is regex-based over the current line only:
- An item or argument regex (src/lsp-features.ts:566-567) gives the indent.
- `enclosing()` finds the parent node: the nearest node above that starts to the left (src/lsp-features.ts:618-625).
- `sectionAt()` finds the section from heading lines (src/lsp-features.ts:608-615).
- The keyword is capture group 2 of the argument regex.
- `moduleAround` climbs ancestors to a `module` or `fn` declaration and strips it to a snapshot module (src/lsp-features.ts:640-651). If there is no enclosing module, the result is null and nothing is filtered (for example in flows).

**Data sources:**
- `ws.analysis.snapshot.nodes` (a fresh `generateMap`, src/analyze.ts:153-154)
- `ws.analysis.spec.planned`
- `dependencyKindOf` over snapshot, index and planned (src/rules.ts:67-74)
- deny rules (src/rules.ts:77-107)
- Explanations/briefs, the `doc` brief and `exports` data are not used.

**Freshness:**
- In the LSP, the buffers are the overlay and each request waits for the current generation (src/lsp.ts:197-219).
- The TUI's `live()` swaps in the buffer docs but keeps the old `analysis.spec` (src/tui/app.ts:511-518). So a `planned` item just typed is not offered until the next reanalysis. This is inferred from the code, not tested.

**TUI specifics:**
- The TUI re-filters by prefix: starts-with first, then contains (src/tui/app.ts:1122-1125).
- It opens after a space or dot, after 2 or more characters, or on Ctrl+Space (src/tui/app.ts:1117, 1000, 1040, 1081).
- Accepting splices `item.label` at its own `from` and **ignores `textEdit`** (src/tui/app.ts:1131-1145).
- The TUI word scan does not skip `[` (src/tui/app.ts:1114-1116, compared with src/lsp-features.ts:575). So in the TUI a prefix like `[domain.or` matches no label and completion inside link references never opens. Inferred from the code, not tested.

## 3. Whether external packages appear

**Yes, but only packages some file imports:**
- They are snapshot modules `external.<segment>` with `layer:"external"`, `file:null`, `members:"opaque"`. `comment` holds the original package name when it differs from the segment (src/graph.ts:249, 365-369; src/snapshot.ts:194-210).
- They show up after the `ID_ARGS` keywords as `{label:"external.zod", kind:9}` with **no detail**. The package name from `comment` is not shown.
- The probe listed 11: `external.anthropic-ai-sdk` (@anthropic-ai/sdk), `external.fugood-whisper_node` (@fugood/whisper.node), `external.node` (all Node built-ins), `external.zod`, and so on. These match keylang/map/external.md.
- They are never offered after `step`/`trigger`, because they have no fns.
- Deny rules do filter them: with the `deny base external.web-tree-sitter` rule (keylang/rules.md:20), it is not offered under a `base` module.

**ID rules:**
- `externalSegment` turns `@scope/pkg` into `scope-pkg` and `.` into `_` (src/graph.ts:870-872).
- Collisions get `-2`, `-3` suffixes with a warning (src/graph.ts:880-906).
- `declaredExternalIds` repeats the segment logic but not the collision suffixes (src/declared-packages.ts:18-21).

**Declared but not imported packages are not offered:**
- `declaredExternalIds(root)` is computed in `analyze()` and passed only to `assess` (src/analyze.ts:193). It only suppresses K001 (src/resolve.ts:38, 254). It is not in `Analysis` (src/analyze.ts:137-144, 197).

**No package members or exported symbols anywhere:**
- external modules are opaque (src/graph.ts:249)
- export targets into external resolve to `none` (src/graph.ts:864)
- docs/format.md:633 says the model does not describe `exports` for them
- `external.x.y` resolves as opaque, i.e. "unverified", not K001 (src/resolve.ts:260-267)

## 4. Code actions and quick fixes

**There are none in the LSP:**
- no `codeActionProvider` (src/lsp.ts:319-332)
- no `textDocument/codeAction`, `completionItem/resolve` or `workspace/executeCommand`: they return -32601 (src/lsp.ts:281-303)
- no server-side `workspace/applyEdit`; the only request the server sends is `workspace/diagnostic/refresh` (src/lsp.ts:232)
- code lenses exist, but only `keylang.flows` with flow names, a client-side command (src/lsp-features.ts:661-672)

**What a K001 fix could build on:**
- The message ends with "did you mean `x`?" and "declare `planned`" (src/resolve.ts:254-259, using `Index.suggest` at src/resolve.ts:94-109).
- `Diagnostic.target` holds the dangling ID (src/diag.ts:59-60).
- LSP `data` exposes only `{verdict, reason?}` (src/lsp-features.ts:203, 219), so a client cannot see the target or the suggestion.

**TUI:** K001 is shown while typing, but nothing applies a fix. The nearest things:
- `Ctrl+G` text→spec: a MERGE proposal (src/tui/app.ts:1555-1583)
- ghost lines: at most 3, filtered to known or planned IDs (src/ghost.ts:29-57)
- the agent draft via MERGE (src/tui/assist.ts)

**MCP:** `search` (fuzzy:false) and `validate_spec`, which returns diagnostics for an overlay text (src/mcp.ts:74-85, 226-245). There is no completion or fix tool.

## 5. Test coverage

In tests/lsp.test.ts:

| Line | Test | What it checks |
|---|---|---|
| 347 | "lsp: format 2 completion hides a symbol an incomparable deny wins over" | deny filtering under rule format 2 |
| 378 | "lsp: completion still offers a fn a member deny cannot scope" | a member-level deny does not hide the fn |
| 570 | "lsp: completion under a module leaves out what deny forbids; after step only callables" | deny filter, `labelDetails.planned`, `allow` not filtered, step gives kind 3 only, flow-top keywords |
| 608 | "lsp: a completion replaces the whole dotted prefix, which editors split at dots" | `textEdit`/`filterText` for IDs and keywords |
| 633 | "…completion work on the ID inside a link reference" | the `[` stays in the link |
| 661 | "…signature help" | signature help label |

Other coverage:
- tests/tui.test.ts:206 "tui: completion after `step` offers callables and Tab inserts one"
- tests/tui.test.ts:881 "tui: undo closes the completion list…"
- tests/tui.test.ts:1214 (performance of the word scan)
- tests/tui.test.ts:1063 (ghost stats)
- editors/vscode/test/smoke.js:62-78 (a real VS Code client)

**Not covered:**
- external IDs in completion
- `completionProvider` capabilities
- `reads`, `emits`, `then`, `module` arguments
- keywords outside flow top
- the K005/K101 defects in section 1
- the TUI link-reference case
- `stats.suggestions.completion`

## 6. Where new features would attach, and the constraints

**Where the changes go:**
- **A shared seam:** `completions()` feeds both the LSP and the TUI, so new item fields affect both. The TUI must be taught to apply `textEdit`/`additionalTextEdits`, because today it inserts the label (src/tui/app.ts:1139-1144). Its popup shows only label and detail (src/tui/view.ts:436-452).
- **Dependency completion:**
  - Add `knownExternal` to `Analysis` (it is already computed, src/analyze.ts:193). Mark declared-only items apart from imported ones.
  - Surface the package name as `detail` (`SnapshotNode.comment`).
  - Share `externalSegment`: it is private in graph.ts and duplicated in declared-packages.ts.
  - Add the missing positions, dispatched on the parent node kind instead of the keyword regex: `<alias> <id>` under a map module (docs/format.md:300) and `planned module external.…`.
- **Package symbols** would be a new extractor (for example `.d.ts`/`exports` from `node_modules`). That conflicts with the documented model: docs/format.md:421 says a package present only in `node_modules` is not known, and docs/format.md:633 excludes `exports`. Such items would verify only as "unverified" (opaque).
- **Auto-import edits:**
  - The LSP spec restricts `additionalTextEdits` to the same document.
  - Adding `- allow …` in rules.md, or a `planned` line in another file, needs `command` plus `workspace/applyEdit` (not implemented) or a `codeAction` with a `WorkspaceEdit`. The hand-written transport has to add any new method itself (ADR 0006, src/lsp.ts:7-8).
  - `completionItem/resolve` would need a `resolveProvider` capability and a `data` field.
  - The harness adapters (src/adapters/harness.ts) register MCP, AGENTS.md and hooks but no LSP (grep result). For coding agents, the practical channel is MCP: `validate_spec`, and possibly a new completion or fix tool over `completions()`.

**Constraints:**
- **Scan cost on every analysis:** `declaredExternalIds` walks the whole tree on every `analyze()`. That means every LSP generation and every TUI reanalysis. `readdirSync(recursive)` walks into `node_modules` before the filter drops them (src/declared-packages.ts:24-32). Probe: 947 ms on this repo.
- **Scan scope differs from the docs:** the scan ignores `exclude` and picks up bench and worktree manifests. The probe found 170+ IDs such as `external.radix-ui-react-dialog` from `bench/repos/*`. docs/format.md:421 says only `package.json` files "between the code file and the root" count, so docs and code disagree here.
- **Filter cost:** `blocksDependency` re-collects the rules per candidate (src/rules.ts:99). Probe: 32-136 ms per request in a module context, which grows with more items.
- **Python:** Python manifests are not read (src/declared-packages.ts:2-3).
- **Core independence:** the language core and the rules layer must stay independent of tree-sitter (keylang/rules.md:14-22).