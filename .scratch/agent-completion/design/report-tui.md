**TUI as editor: completion, ghost text, edits, keys, tests and gaps (keylang, read-only; verified in code and with scratch probes)**

In short: the TUI already has a deterministic completion popup and LLM ghost text. Neither can insert text anywhere except the cursor line, and neither knows the symbols a library exports. The edit primitive can already change several lines of the current buffer as one undo step. It cannot touch another file or any source-code file.

"Verified" below means I read it in the code or tests, or saw it in a throwaway probe that drove `App` through `app.input()` (scratchpad only, no repo files changed). "Docs" means it is only claimed in the docs.

## 1. Completion popup (verified)

**State.** `State.completion = { items, index, from, shown? }` (`src/tui/state.ts:148`).

**Triggers (edit mode only):**
- It is refreshed after every typed insert (`src/tui/app.ts:1081`) and after Backspace (`app.ts:1040`).
- It opens on its own when:
  - the character before the cursor is whitespace or `.`, or
  - the prefix has at least 2 characters, or
  - the list is already open (`app.ts:1117`).
- `Ctrl+Space` in edit mode opens it explicitly, even mid-word (`app.ts:1000`, `app.ts:1102`).
- It needs a finished analysis and a parsed `.md` buffer (`app.ts:1106`). `keylang.json` has no doc (`src/tui/buffer.ts:367-369`), so that file never gets completion.

**Data source.** The same `completions()` the LSP uses (`src/lsp-features.ts:560-606`). It runs over the `live()` workspace, which includes unsaved buffers (`app.ts:511-518`). What it offers depends on the position:
- after `- `: keywords for that position (`lsp-features.ts:579-583`);
- after `step` / `trigger`: only `fn` and `planned fn` (`:586`, `:593`, `:600`);
- after `calls` / `reads` / `emits` / `allow` / `deny` / `then` / `module`: modules, functions and types, minus what the rules forbid, except under `allow` / `deny` (`:553`, `:589`, `:594`);
- the snapshot nodes and `spec.planned` are the only two sources (`:592-604`).

The TUI then filters again by word prefix: matches at the start first, then substring matches (`app.ts:1122-1124`). It hides the list when the only item equals the prefix (`app.ts:1125`).

**What it shows** (`src/tui/view.ts:436-452`):
- at most 8 visible rows, placed below the cursor line or above it if there is no room (`:444`);
- the title is always "`N ids`", even for keyword lists (`:445`);
- each row is `label  detail`, where detail is the signature or `planned …` (`:449-450`);
- there are no kind icons and no documentation.

**Keys and acceptance:**
- `↑` / `↓` cycle through items (`app.ts:985-988`).
- `Tab` / `Enter` accept (`:989`). `Shift+Tab` also accepts, because Shift+Tab decodes as `tab` (`src/tui/input.ts:327`).
- `Esc` closes the list without leaving edit mode (`app.ts:990-993`).
- The list also closes on cursor movement (`:1008-1010`), Enter (`:1023`), undo (`:1085`), a click (`:1434`) and opening a file (`:426`).
- Accepting replaces `[from, cursor.col)` on the cursor line with `item.label` (`app.ts:1139-1144`). It ignores the item's `textEdit` (`lsp-features.ts:545`, `:577-578`).

**Stats.** Shown, accepted and rejected counts go to `.keylang/stats.json` under `suggestions.completion` (`src/tui/assist.ts:58-68`; `app.ts:991`, `:1127`, `:1136`).

**Bug found (probe).** The TUI finds the start of the word by scanning back to whitespace or a comma only (`app.ts:1114-1115`). The LSP also skips a leading `[` (`lsp-features.ts:575`). As a result, `- step [domain.or` gives no list in the TUI, while the LSP handles it (`tests/lsp.test.ts:633-655`).

## 2. Ghost text (verified; LLM-only)

**Trigger:**
- `ghostSoon()` runs after every key in edit mode (`app.ts:979`).
- It needs a snapshot, `config.agent` set, and no open completion list (`assist.ts:125`).
- The signal is `ghostSignal`: the line matches `^\s*- ?$`, the cursor is at its end, and the line is inside a `# flow` section that has a `trigger` (`src/ghost.ts:367-377`).
- The pause is `ghost.delay`: default 400 ms, allowed 0–10000 (`src/config.ts:147`, `:236-242`; `assist.ts:146`).

**Model call:**
- `llmClient()` supports only `anthropic:` and `openrouter:` (`src/llm.ts:40-60`; `config.ts:234`).
- Without credentials it does nothing, silently (`assist.ts:136`).
- The prompt is the flow text up to the cursor line plus the context pack; `maxTokens` is 256; the model returns up to 3 variants (`ghost.ts:380-387`).

**Deterministic filter after the model.** A variant is dropped before it is shown if:
- it does not start with `- `;
- re-parsing the buffer with the line in place gives a diagnostic on that line;
- it names an ID that is neither in the snapshot nor `planned` (`ghost.ts:388-406`).

**Stale-result guards.** A request counter, a `Spot` (path, version, mode) and the cursor line (`assist.ts:129`, `:139`). `state.ghost` also carries path and version (`state.ts:153`).

**Rendering.** Grey italic (colour 242) suffix after the typed text, plus `(i/n, Alt+])` when there are several variants (`view.ts:212-219`).

**Keys:**
- `Tab` accepts only when no completion list is open (`app.ts:971-974`). It replaces the whole line `lines[ghost.line]`, and only if the path, version and edit mode still match (`assist.ts:150-163`).
- `Alt+]` shows the next variant (`app.ts:967-969`).
- `Esc` drops it and stays in edit mode (`:976`). Any other key drops it and is then handled normally (`:975`).
- A mouse press, a paste, a panel key or anything outside the editor also drops it (`app.ts:759`).

**Other facts:**
- Stats go to `suggestions.ghost` (`assist.ts:141`, `:162`, `:170`).
- There is no deterministic (non-LLM) ghost.
- It is one line only, by design (docs: `docs/design.md:465-470`).

## 3. How edits are applied (verified)

**The primitive is `edit(change, coalesce)`** (`app.ts:467-486`):
- It refuses read-only buffers (`:470-473`) and clears `lastMerge` (`:475`).
- It pushes a snapshot of the whole text and cursor onto `buffer.undo`, capped at 200 (`:477-478`).
- It hands the callback the entire `lines[]` array and the cursor (`:479-480`). So one callback can edit any number of lines of the current buffer as one undo step. Voice input already does this when it splices several lines (`assist.ts:255-268`).
- It then calls `setText` (bumps `version`; `buffer.ts:377-381`), clamps the cursor, scrolls, and schedules a re-analysis.
- It has no range or offset API and no mapping of positions after an edit. When a line is inserted above the cursor, the callback must move `cursor.line` itself.
- `completion.from` is not tied to the buffer version; the only check is `from > cursor.col` (`app.ts:1138`).

**Undo:**
- `Ctrl+Z` restores the last snapshot (`app.ts:1084-1097`).
- There is no redo (no match for "redo" in `src/tui/`).
- Single non-space characters (`:1080`), Backspace (`:1039`) and Delete (`:1049`) are coalesced into one undo step.

**Other locations:**
- `edit()` only touches the current buffer (`app.ts:468`).
- Changes to another file go only through MERGE, which holds one path (`state.ts:59-82`; `src/tui/merge-session.ts:146`). Examples: text → spec (`app.ts:1583`), the agent draft written as a proposal (`assist.ts:327`, `:344`), and spec-to-code proposals for source files (`merge-session.ts:131`).
- Source files cannot be edited at all. Code mode is a read-only viewer (`state.ts:49-57`; `app.ts:1337-1358`), and the file list contains only spec `.md` files and `keylang.json` (`app.ts:384-398`).

**Consequence for auto-import:**
- An import inside the same spec file is feasible with a single `edit()` call.
- An import into another spec file (for example `rules.md`) needs a multi-buffer edit or MERGE.
- An import into source code needs the MERGE "code" path.

## 4. Key bindings in use

**Before any mode** (`app.ts:756-807`): `Ctrl+C` quits (`:772`); `F2` / `F3` / `F4` toggle panels (`:782-793`); `F5` re-analyses (`:778`).

**Edit mode** (`app.ts:964-1054`, `:827-866`):

| Key | Action |
|---|---|
| printable keys | insert |
| `Enter` | new line, continues a list item; `Alt+Enter` does the same |
| `Backspace` / `Delete` | delete |
| `Tab` | accept completion, else accept ghost, else insert two spaces; `Shift+Tab` behaves the same, no dedent |
| `Esc` | close list / drop ghost / back to view |
| arrows, `PgUp` / `PgDn`, `Home` / `End` | move |
| `Shift+↑↓` | select lines |
| `Ctrl+S` / `Ctrl+R` / `Ctrl+Z` / `Ctrl+G` / `Ctrl+O` | save / voice / undo / text→spec / back |
| `Ctrl+Space` | completion |
| `Alt+]` | next ghost variant |

- The same key means different things in two modes: `Ctrl+Space` is completion in edit mode but the agent's flow draft in view mode (`app.ts:880`).
- **Free in edit mode:** all `Alt+<letter>` (ignored at `app.ts:1053`); `Ctrl+A B D E F K L N P T U V W X Y`; `F1` and `F6`–`F12` (decoded at `input.ts:215-217`, not handled). Not free: `Ctrl+H` / `I` / `J` / `M` / `[` arrive as Backspace / Tab / Enter / Esc (`input.ts:296-300`).
- **Help:** `?` opens help in view (`app.ts:946-948`), nav (`:1296-1297`), code (`:1357-1358`) and MERGE (`merge-session.ts:221-222`). In edit mode `?` just types `?` (probe). So the edit help table (`view.ts:469-474`) cannot be reached, even though the edit status line says `? keys` (`view.ts:517`). That table also leaves out `Alt+]`, ghost `Tab`, `Ctrl+R` and `Ctrl+O`.
- **Docs:** the key table is at `docs/tools.md:139-146`. Ghost, voice and `Ctrl+Space` are only described in prose at `docs/tools.md:148`. Completion is at `docs/tools.md:156`; the design is `docs/design.md:460-471`.
- **Hypothesis (unverified), web:** the xterm `Terminal` is created without `macOptionIsMeta` (`src/tui/web.ts:425-433`), so on macOS `Option+]` may not reach the TUI as `ESC ]`. Browser shortcuts such as `Ctrl+W` / `T` / `N` are probably taken by the browser. The web tests send raw bytes, not keyboard events, so neither is tested.

## 5. How the TUI is tested (verified)

**In-process tests:**
- `tests/tui.test.ts:31-38` `session()` creates the `App` in the test process and attaches a surface that writes into `VirtualTerminal` (`tests/vt.ts:7-58`).
- Tests send real byte sequences (`KEY` in `tests/tui-fixture.ts:50-64`) against the `checkoutRepo` fixture (`tui-fixture.ts:37-48`).
- `await app.idle()` (`app.ts:248-251`) waits for the analysis, the ghost timer and other tracked work.
- Assertions check the screen text and the file on disk, but also internal state (`s.app.state.completion` / `.ghost`).

**LLM:** a local HTTP server that imitates the Anthropic API, reached through `ANTHROPIC_BASE_URL` (`tests/tui.test.ts:980-1005`).

**Coverage:**
- completion: `tui.test.ts:206-226`, `:881-894`;
- ghost: `:1063-1099`, `:1364-1396`, `:1398-1416`;
- terminal transport: `fakeTerminal` + `runTerminal` (`~:1590-1622`, `:1624`, `:1644`).

**Web:** `tests/web.test.ts` starts the real `keylang web --port 0` (`:35-36`) and drives it through a WebSocket client backed by `VirtualTerminal` (`:55-75`). It checks the browser screen against the terminal screen and against `@xterm/headless` (`:191-232`, xterm at `:225-230`).

**Not covered:**
- completion or ghost in the web;
- keyword completion in the TUI (only in the LSP, `lsp.test.ts:602-605`);
- explicit `Ctrl+Space` completion;
- completion stats.

## 6. Gaps for an IDE-like editor with dependency completion and auto-import

1. **No library symbols.**
   - Completion reads only snapshot nodes and `planned` (`lsp-features.ts:592-604`).
   - An imported package exists only as an `external.<pkg>` module with no members (`src/graph.ts:365-369`); calls into it are not followed (`graph.ts:179`).
   - Probe: `external.lodash` is offered after `calls` but not after `step`. `zod`, declared in `package.json` but never imported, is not offered: `declaredExternalIds` (`src/declared-packages.ts:15`) is not a snapshot source.
   - Python manifests are not read at all (`declared-packages.ts:2-3`).
   - Fixing this needs a package-export index (npm `exports` / `.d.ts`, Cargo, PyPI) and probably a new node kind or a separate completion source. That changes a contract (`SnapshotNode.kind`, `src/snapshot.ts:99`).
2. **No additional edits on a completion item.**
   - `CompletionItem` has no `additionalTextEdits` or `command` (`lsp-features.ts:533-546`), and the TUI ignores `textEdit`.
   - Auto-import needs: extra edits on the item; applying them in `acceptCompletion` inside one `edit()` call (one undo step); converting UTF-16 positions to clusters (`LineLayout.units`, `src/tui/width.ts:105-123`; `clusterAt` `:154`); and moving the cursor when lines are inserted above it.
   - The LSP has no `codeAction` / quick-fix handler either (`src/lsp.ts:282-298`).
3. **Open semantic question: what does "import" mean in a keylang spec?** The format has no import statement. Possible targets: a `- planned` declaration, a `calls` / `module` item, or an `allow` in `rules.md`. The last one is another file, so it needs multi-buffer `edit()` (via `load()`, `app.ts:406`, each buffer with its own undo stack) or MERGE. This choice changes the language's semantics and the UX, so it should be put to the user.
4. **Imports in source code** (e.g. a TS `import`): only possible through the MERGE "code" path (`merge-session.ts:131`), because the TUI does not edit code files.
5. **Popup and IDE basics missing:** kind icons and a documentation pane; fuzzy scoring (substring only, `app.ts:1122-1124`); `Ctrl+N` / `Ctrl+P`; signature help (the LSP has it at `lsp.ts:294` / `lsp-features.ts:310`, the TUI does not); redo; dedent (`Shift+Tab` == `Tab`); find/replace; word-wise motion; a help key in edit mode; the link-reference `[` bug from section 1.
6. **Ghost limits for coding-agent hints (A):**
   - Providers are only anthropic and openrouter; there is no hook for Cursor CLI, Claude Code or opencode.
   - It works only on a new item in a flow that has a trigger, and gives one line.
   - It fails silently when credentials are missing.
   - Outside the TUI, agents get context through MCP `context` (`design.md:577`); an opencode plugin is listed as out of v1 (`design.md:588`).
7. **Docs and tests to update for new keys:** `docs/tools.md:144` plus the `HELP` / `HINTS` tables (`view.ts:454-521`). New tests fit the `session()` pattern; the web tests need a parity check for the popup.

No roadmap for auto-import or library-symbol completion exists in `docs/design.md`.