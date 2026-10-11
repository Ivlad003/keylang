# 7. Wiring, the UI, and agents

[Course](README.md) · **English** · [Українською](uk/07-tools.md)

Rules and flows check the code the agent generated. You wrote the spec, not the functions, and keylang itself never starts the agent. This lesson covers what is built on top of the same analysis: a wiring generator, the UI in the terminal and the browser, and the tools for agents. None of them has a verdict of its own. Whatever they show, `check` stays the one source of truth.

## Wiring

Something has to build your objects and hand them their dependencies. In keylang you list the factories in a `# wiring` section, and `keylang wire` writes `keylang.gen.ts` from it. That file holds a typed `async function wire(env)` that builds each factory once, dependencies first. There is no container and no lookup by string, so the result is plain code you can read. [ADR 0003](../adr/0003-wiring-lifecycle.md) describes the contract.

```markdown
# wiring

- wire app.purchase.createPurchase
  - store domain.store.Store
- wire domain.store.Store
  - db infra.db.createDb
    - when env.DB = memory → infra.memory-db.createMemoryDb
    - compose infra.logged.logged
```

`wire <id>` names a function, which is called with an object of named dependencies, or a class, which is constructed with that object. Each child line `<alias> <id>` is one dependency. An id with no `wire` line of its own is a leaf, built with no arguments. A line `when env.NAME = value → <id>` picks another implementation when the variable has exactly that value. The first match wins, and when nothing matches, the dependency line itself is the fallback. `compose <id>` wraps the value. Several `compose` lines apply in source order, the first one closest to the value.

Mistakes in the section become diagnostics. An unknown id is K001, and a repeated `wire` id is K002. A cycle among factories is K301. K302 means the generated file cannot build the target: it is a module, a type, Python or Rust code, an instance method, or a name the module does not export. A static method is allowed. A `deny` rule between a factory and one of its dependencies is K102.

`keylang wire` refuses to overwrite a file that lacks the `// keylang:generated` marker and exits with code 1 instead. If the section has any diagnostic, it writes nothing. `--check` only compares and writes nothing. The generated file is an ordinary module in whatever layer its path falls into, so the same `deny` rules apply to it. `tsc` checks its types; keylang does not.

Wiring does not isolate modules. A hand-written import simply bypasses `wire()`, and the rules are what catch such imports. Rust generation and request-scoped lifetimes are designed but not in the tool yet.

## The terminal and the browser

The UI is where you read the spec and its verdicts side by side. Run `keylang` with no command and it opens the UI when stdin and stdout are a terminal; otherwise it prints usage and exits with code 2. `keylang web` serves the same UI at `http://127.0.0.1:7070/#t=<token>`. The token sits in the URL fragment, which the browser does not send to the server. Localhost is the default. With another `--host`, only the token protects the UI, so for remote use an SSH tunnel to localhost is the safer setup.

The screen shows the spec, a gutter with a mark beside each line, a status line, and a tree. `?` opens the list of keys:

![Keys for view mode](images/tui-help.png)

Esc closes it again:

![The key list, then Esc](images/tui-keys.gif)

| Key | Action |
|---|---|
| `↑` `↓` or `j` `k` | Move |
| `Enter` | Open the code for the id |
| `K` or hover | Show the signature, the file, the evidence |
| `Tab` | Editor, then the tree, then the file list |
| `F2` / `F3` | Show or hide the file list / the navigation panel |
| `F5` | Analyze again |
| `F6` | The current analysis and the results of operations |
| `F7` | The chat with the built-in assistant (the paper clip), which proposes spec changes only |
| `v` | Reading mode; the gutter stays tied to source lines |
| `i` | Edit; generated maps refuse |
| `/` then `n` | Search this buffer |
| `:` | Command palette; `open keylang/rules.md` jumps to a file |
| `t` | On a layer file, switch between the map and the explained map |
| `s` | Find a node by id or by words in its note |
| `m` | Merge the proposal for this file, hunk by hunk |
| `q` | Quit |

![Command palette filtered to the rules file](images/tui-palette.png)

![Reading mode on the rules](images/tui-read.png)

![File list beside the generated map](images/tui-files.png)

`Enter` on an id opens the code. In a terminal with `$VISUAL` or `$EDITOR` set, it opens in that editor. Without one, and always in `keylang web`, it opens in a read-only viewer. `Esc` takes you back:

![cli.cli.main opened from the trigger](images/tui-code.png)

While you edit, `Ctrl+S` writes the file and `Ctrl+Space` completes keywords and ids. `Ctrl+G` turns the selected prose into `step`, `when` / `then`, `invariant` or `emits` lines. It does not call a model. It only recognizes ids the snapshot already has, plus a few cue words: `when`, `if`, `коли`, `якщо`.

To look at someone else's repository, give `keylang web` its URL. `keylang web <url>` first clones the repository the way `keylang clone` does (see [the first hour](existing/01-the-first-hour.md)), then serves the UI on the clone.

To run keylang and git inside a container, use the `Dockerfile` in the repository. Clones go to the `/cache` volume, and `/work` is the folder you mount:

```sh
docker build -t keylang .
docker run --rm -v keylang-cache:/cache keylang clone https://github.com/owner/repo
docker run --rm -p 127.0.0.1:7070:7070 -v keylang-cache:/cache keylang web https://github.com/owner/repo --host 0.0.0.0
docker run --rm -v "$PWD":/work keylang check
```

Inside a container the server has to listen on `0.0.0.0`, so the token is the only guard; `127.0.0.1:` in `-p` keeps the port on your machine. In the printed URL, replace `0.0.0.0` with `localhost`.

## The diagram page

Text is not the only view. `keylang web` also serves a page of diagrams. The «Діаграми» link at the top right of the terminal page opens it in a new tab with the same token. The page's labels are in Ukrainian.

![The checkout flow on the diagram page, a step selected](images/diagrams-flow.png)

You pick a view from the list on the left: a flow, a discovered flow, an entry point or the layer view. The canvas draws it as BPMN-style shapes, one lane per layer, colored by the same verdicts as the gutter. Select a shape, and the panel on the right shows its id, its place in the code and in the spec, and its `check` results. Above the list you switch between four modes:

- Diagrams (Діаграми);
- Explorer (Дослідник), an entry point's call tree from which you can save a flow as a proposal;
- Blind spots (Сліпі зони), the `keylang coverage` report;
- Editor (Редактор).

![The editor: a planned step added to the checkout flow](images/diagrams-editor.png)

In the editor, a view taken from the code (з коду) lets you change only its layout, while a draft (чернетка) is fully editable. You drag a layer, a step, a trigger, a `when`, a `parallel`, an event or a timer from the palette, and connect shapes with a meaning: sequence, call, dependency, `allow`, `deny`, `emits` or `continues`. A new shape gets a `planned:` id. `Ctrl+Z` and `Ctrl+Y` undo and redo. SVG and PNG export the picture in the browser. `Ctrl+C` / `Ctrl+V` copy shapes between tabs as a `flow export` bundle, even between two `keylang web` servers. The layout goes to `keylang/diagrams/<view>.layout.json`; commit it so the team sees the same picture.

Nothing on the page writes a spec directly. «Запропонувати зміни» (propose changes) turns the drawing into proposals for the specs it changes, as `keylang diagram propose` does.

You can also start a project from a drawing. `keylang web --new <dir>` opens the editor on an empty canvas with a template of lanes. The button «Створити специфікацію» writes `keylang.json`, `rules.md`, the features and the layout, but only the files that do not exist yet. The [from-scratch track](from-scratch/README.md) walks through it.

The same views also leave the browser as files. `keylang export bpmn <flow>` writes BPMN 2.0, `keylang export drawio <view>` a draw.io file, and `keylang export c4` a C4 diagram for PlantUML or Mermaid. If someone changes a drawing in draw.io, `keylang import drawio <file>` reads it back as one proposal for the flow's spec.

Flows can also move to another codebase, for example when you port a system to a new stack. `keylang flow export <name>` packs flows into one portable Markdown bundle. In the other repository, `keylang flow import` proposes them as a feature on `planned` nodes, plus rows of `keylang/migration.md`. `keylang migration status` then reports, flow by flow, whether the new stack has the counterpart and whether the same tests pass in both.

Outside the browser, `keylang lsp` serves the same diagnostics over stdio. The client in `editors/vscode/` is a thin wrapper around it. It is not published in the Marketplace and is not part of the npm package.

## Agents

keylang does not launch an agent; it prepares the agent you already use. `init` and `keylang agents` write a short instruction block. Where they find Claude, Codex, Cursor or opencode, they also install the MCP server and the skill. [Lesson 2](02-install-and-check.md) lists the directories they look for. The division of work stays the same: you write the spec, the agent generates the program from it, and you do not write the functions yourself. Whatever the agent produces, `check` has the final word.

A feature file is an ordinary spec. `keylang feature <slug>` reports the feature as done when, among other things, every `planned` item is implemented, every step is static `ok`, no rule `fail` of this change remains and no `?` is open; [lesson 6](06-flows.md) has the full list. It shows tests and traces, but they do not block it.

For Claude and Codex, keylang also installs a Stop hook, which runs when the agent is about to finish. `keylang hook stop` runs the check on what changed, and its answer is always JSON with exit code 0:

- If a new `fail` appeared, or the spec was weakened since `HEAD` (K108), it answers `decision: block`, and the agent has to keep working.
- If there is no new `fail`, or the same event arrives again with `stop_hook_active: true`, it answers `{}`.
- If it cannot check the turn at all, for example without git or with a broken `keylang.json`, it answers with a `systemMessage`. The harness shows that to you without blocking the agent.

An unverified line does not block. Cursor uses Claude's hooks, and opencode gets no Stop hook at all.

The agent cannot rewrite your hand-written rules behind your back: they change only through a proposal. `apply_diff` stores the new text and leaves the file untouched until you merge it. It refuses to touch a generated file.

| Command | What it proposes | What it will not do |
|---|---|---|
| `draft flow <trigger>` | A flow under `.keylang/proposals/` | It does not edit the spec. `--mode algo` follows resolved calls to depth 4 |
| `draft rules` | Rules the code already satisfies, or the model's rules tagged `agree`, `conflict`, `llm-only` | It does not weaken a `deny` you wrote unless you merge that hunk |
| `draft map` | Nothing; it only prints a layout | The file changes only when you edit it |
| `code-to-spec <file:line>` | Flows for the function, or for every exported function | `--since <git-ref>` limits the draft to functions the diff touches |
| `spec-to-code <id>` | A stub and failing tests for a `planned fn` | Files are written only with `--apply`, not by default |
| `draft flow --from-trace <file>` | A flow from what one trace run observed | Steps static does not see are marked as observed, not proved |
| `flows adopt <name>` | A discovered flow as a spec | `flows discover` itself writes only the generated view |
| `diagram propose`, `import drawio` | The changes of a drawing, one proposal per spec | New layers for `keylang.json` are only printed |
| `explain <id> --llm` | `keylang/explain/<id>.md` | It never changes a verdict |

`keylang mcp` serves search, node, code, flows, check, explain, context, `validate_spec`, `scaffold`, `feature_status`, `list_entries`, `discover_flows`, `coverage_report`, `list_integrations`, `project_tour`, `migration_status`, and `apply_diff`. Only `apply_diff` writes anything, and what it writes is a proposal.

You review proposals yourself. In the UI, `m` opens the diff. `a` accepts a hunk, `r` rejects it, and `w` writes the accepted hunks. A hunk you have not decided on is not applied. Outside the UI, `keylang proposals` lists what is pending, `proposals show <target>` prints the diff, and `proposals accept` or `proposals reject` settle it. Accepting is for a person, never for an agent.

The UI can ask a model for a draft too. In view mode, `Ctrl+Space` on a flow that has a trigger asks the model for a draft and opens the merge. This needs a model: `agent` in `keylang.json`, or `KEYLANG_AGENT`, as in [lesson 2](02-install-and-check.md). After you merge, `check` evaluates the new steps like any others, so a line the snapshot does not support becomes `unverified` or `fail`, never `ok`.

Ghost text is a single suggested line at the end of a fresh `- ` bullet; `Tab` inserts it. Voice input (`Ctrl+R` while editing) is optional, and `keylang doctor` tells you which engine is set. Neither writes a file on its own.

So let the tool propose, read each hunk, and accept the ones that say what you meant. When in doubt, believe `check`, not a comment saying that a model wrote the line.

Next: [the sessions](08-use-cases.md).
