# 7. Wiring, the UI, and agents

[Course](README.md) · **English** · [Українською](uk/07-tools.md)

Rules and flows check the code you already have. Three more surfaces sit on the same analysis: a wiring generator, the terminal and browser UI, and the agent tools. None of them invent a second verdict.

## Wiring

`# wiring` lists factories. `keylang wire` generates `keylang.gen.ts`, a typed `async function wire(env)` that builds each factory once, dependencies first. There is no runtime container and no lookup by string. The contract is [ADR 0003](../adr/0003-wiring-lifecycle.md).

```markdown
# wiring

- wire app.purchase.createPurchase
  - store domain.store.Store
- wire domain.store.Store
  - db infra.db.createDb
    - when env.DB = memory → infra.memory-db.createMemoryDb
    - compose infra.logged.logged
```

`wire <id>` is a function called with an object of named dependencies, or a class constructed with that object. A child `<alias> <id>` is one dependency. An id with no `wire` of its own is a leaf, constructed with no arguments. `when env.NAME = value → <id>` picks another implementation when the variable has that exact value; the first match wins, and the dependency line is the fallback. `compose <id>` wraps the value in a one-argument function. Several `compose` lines apply in source order, the first closest to the value.

`check` treats the section like any other spec. An unknown id is K001. A repeated `wire` id, or two dependencies with the same name under one `wire`, is K002. A cycle among factories is K301 and names the path. K302 is a target the generated file cannot import or call: a module, layer or type used as a factory; a Python or Rust function (the generator emits TypeScript); an instance method; a name the module does not export. A static method is allowed. The generated file calls it on the imported class (`Pool.open(deps)`), as a factory or as `compose`. A `deny` between the factory and a dependency is K102.

`keylang wire` writes `keylang.gen.ts` with the marker `// keylang:generated`. It will not overwrite a file that lacks the marker (exit 1). Any diagnostic on the section writes nothing. `--check` compares and writes nothing. `--out` accepts a relative `.ts`, `.mts` or `.cts` path inside the repository. The generated module is an ordinary module in whatever layer its path falls into, so the same `deny` rules apply to it. `tsc` of the project typechecks it. keylang does not.

Wiring does not isolate modules. Hand-written imports bypass `wire()` completely. The rules are what catch those imports. Rust generation, lazy dependencies and request-scoped lifetimes are in the design and not in the tool.

## The terminal and the browser

`keylang` with no command opens the UI when stdin and stdout are a TTY, and prints usage with exit code 2 otherwise. `keylang web` serves the same UI at `http://127.0.0.1:7070/#t=<token>` (the port and host are flags). The token is in the URL fragment, which the browser does not send to the server; the page moves it into `sessionStorage` and offers it as a WebSocket subprotocol. Localhost is the default bind. Another `--host` is protected only by the token; an SSH tunnel to localhost is the safer remote setup.

The screen is the spec as Markdown, a gutter, a status line, and a navigation tree. `?` opens the key list for the current mode:

![Keys for view mode](images/tui-help.png)

The view-mode keys you need on the first day:

| Key | Action |
|---|---|
| `↑` `↓` or `j` `k`, `PgUp` `PgDn`, `g` `G` | Move |
| `Enter` or Ctrl+click | Open the code for the id under the cursor |
| `Alt+Enter` | Open the declaration in the spec (for a code id, the generated map) |
| `K` or mouse hover | Hover |
| `Tab` | Editor, then navigation, then the file list |
| `F2` / `F3` | Show or hide the file list and the navigation tree |
| `F5` | Analyze again |
| `v` | Reading mode: headings and emphasis rendered, gutter still tied to source lines |
| `i` | Edit. Generated maps refuse and tell you to change the code or the rules |
| `/` then `n` | Search in the current buffer |
| `:` | Command palette, fuzzy. `open keylang/rules.md` jumps to a file |
| `e` | Show the saved explanation of the id, if you have run `explain --llm`. The CLI prints `fresh` or `stale` |
| `s` | Find a node by id, or by words in its doc comment or saved brief |
| `t` | On a layer file, switch between the map and the explained map. When that map is off, the status line says how to turn `explain.map` on |
| `F4` | The agent context panel: what would be sent with a draft, with a rough token count |
| `m` | Merge the proposal for this file, hunk by hunk |
| `q` or `Ctrl+C` | Quit. With unsaved edits, the first press asks and the second discards |

`:` `rules` filters the palette to the rules file. The screenshot caught it before Enter:

![Command palette filtered to the rules file](images/tui-palette.png)

`v` renders the Markdown. The bullets stay checkable. `Enter` on an id still jumps:

![Reading mode on the rules](images/tui-read.png)

`F2` is the file list. Hand-written specs come first, then generated map files, then `keylang.json`, which opens in the same editor as plain text. Saving it feeds the next analysis:

![File list beside the generated map](images/tui-files.png)

`Enter` on an id opens the built-in read-only code viewer when no `$EDITOR` is set, and always in `keylang web`. In a terminal, `$VISUAL` or `$EDITOR` is used instead (`code` and `cursor` get `-g file:line` and do not take over the screen). `Esc` returns:

![cli.cli.main opened from the trigger](images/tui-code.png)

Editing (`i`) is the spec buffer. `Ctrl+S` writes it. `Ctrl+Space` completes keywords and ids for the position. A K001 from an unknown id appears after the overlay analysis, before you save. `Ctrl+Z` undoes an edit. `Ctrl+G` turns the selected prose, or the paragraph under the cursor, into `step`, `when` / `then`, `invariant` or `emits` lines and opens them as a merge. It does not call a model. It only recognizes ids the snapshot already has, plus a few English and Ukrainian cue words (`when`, `if`, `коли`, `якщо`, `invariant`, `emits`).

The snapshot is built on a worker. While it runs, the status line says the results on screen are stale, and keys keep working. Edits are an overlay until `Ctrl+S`. Nothing is written on the analysis path.

`keylang lsp` speaks the same diagnostics and verdicts over stdio. Workspace symbols find a node by name, by id, and by words in its doc comment or saved brief. The client in `editors/vscode/` is a thin wrapper. It is not published to the Marketplace and it is not in the npm tarball.

## Agents

keylang does not launch an agent. `init` and `keylang agents` write a managed block in `AGENTS.md`. Where they find Claude, Codex, Cursor or opencode, they also register the MCP server `keylang` and copy the `keylang-feature` skill. The agent writes code with its own tools. `check` is still the verdict. Which directories count as a harness is in [lesson 2](02-install-and-check.md). `--agents=none` writes none of those files and still writes the baseline.

A feature file is an ordinary spec. `keylang feature <slug>` and the MCP tool `feature_status` agree: the file is done when every `planned` in `keylang/features/<slug>.md` is implemented, every step of its flows is static `ok`, and no rule `fail` remains, including the baseline. Tests and traces are reported and do not block.

Claude and Codex also install a Stop hook. `keylang hook stop` reads the event from stdin and runs the changed check: findings that touch files changed since `HEAD`, including untracked files and a deleted file a flow still names. A new `fail` answers with `decision: block` and `file:line`. The same event with `stop_hook_active: true`, or a run with no new `fail`, answers `{}`. The hook writes nothing. Either answer is JSON and exit code 0. Cursor uses Claude's hooks. opencode does not get a Stop hook. A normal `check` does not read git.

Hand-written rules change only as a proposal. `apply_diff` stores the full new text of one spec and leaves the file until you merge. It refuses a generated file. After the graph changes, `keylang baseline` rewrites `rules.baseline.md`. A new edge across the baseline is K102 until an `allow` in `rules.md` or that regeneration. Claude and Codex are denied Edit and Write of both rules files.

The other drafts stay proposals.

| Command | Proposal it writes | What it will not do |
|---|---|---|
| `draft flow <trigger>` | A flow under `.keylang/proposals/<spec>/flows/` | It does not edit the spec. `--mode algo` is deterministic from resolved calls, depth 4. `llm` and `hybrid` ask the model and then reconcile. `hybrid` with no model falls back to `algo` |
| `draft rules` | Rules the current code already satisfies, or the model's rules tagged `agree`, `conflict`, `llm-only` | It does not weaken a `deny` you already wrote unless you merge that hunk |
| `draft map` | Nothing. Prints a `keylang.json` layout | The layout changes only when you edit the file |
| `code-to-spec <file:line>` | Flows for the function at that line, or every exported function | `--since <git-ref>` limits the draft to functions the diff touches |
| `spec-to-code <id>` | A stub and failing tests for a `planned fn` | `--apply` writes the files directly. The default does not |
| `explain <id> --llm` | `keylang/explain/<id>.md` | Never changes a verdict. `explain --stale` lists explanations whose code moved |

`keylang mcp` serves, over stdio, search (an id, or words in a doc comment or brief), node, code, flows, check, explain, `context` (the same bundle as `F4`, for one id or every id in a feature file), `validate_spec` (diagnostics for a spec text, and no write), `scaffold` (the `spec-to-code` template, with no model and no write), `feature_status`, and `apply_diff`. Only `apply_diff` writes, and only a proposal. It rejects paths outside the spec directory, generated files, and anything with `..`. The file on disk is unchanged until a person merges.

In the UI, `m` opens the diff of the current file against the proposal. `a` accepts a hunk, `r` rejects it, `u` undoes the last decision, `n` moves, `w` writes the accepted hunks, `Esc` cancels and leaves the proposal. A hunk you have not decided is not applied. `u` from view mode rolls the last merge back, only while the file still contains exactly that result.

`Ctrl+Space` in view mode, on a flow that has a trigger, asks the model for a draft of that flow and opens the merge. It requires `agent` in `keylang.json`. The draft is not evidence: after you merge, `check` evaluates the new steps like any other steps. A line the model invented and the snapshot does not support becomes `unverified` or `fail`, not `ok`.

Ghost text in the editor is a single suggested line at the end of a fresh `- ` bullet. `Tab` inserts it, `Esc` drops it. Voice (`Ctrl+R` while editing) is optional and local-or-cloud. `keylang doctor` says which engine is configured. Neither ghost text nor voice writes a file by itself.

The useful habit is the same one the rules lesson ends on. Let the tool and the model propose. Read the hunk. Accept the ones that say what you meant. Run `check` and believe the verdict, not the comment that says a model wrote the line.

Next: [the sessions](08-use-cases.md). Four of them keep the screenshots. The last one is text.
