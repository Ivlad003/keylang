# 7. Wiring, the UI, and agents

[Course](README.md) · **English** · [Українською](uk/07-tools.md)

Rules and flows check the code that the agent generated: you wrote the spec, not the functions, and keylang itself never starts the agent. On top of that same analysis sit three more surfaces: a wiring generator, the UI in the terminal and the browser, and the tools for agents. None of them produces a second verdict of its own, so whatever they show, `check` stays the one source of truth.

## Wiring

The `# wiring` section lists factories. From it, `keylang wire` writes `keylang.gen.ts`, which contains a typed `async function wire(env)` that builds each factory once, dependencies first. There is no container and no lookup by string, so the result is plain code you can read. The contract is described in [ADR 0003](../adr/0003-wiring-lifecycle.md).

```markdown
# wiring

- wire app.purchase.createPurchase
  - store domain.store.Store
- wire domain.store.Store
  - db infra.db.createDb
    - when env.DB = memory → infra.memory-db.createMemoryDb
    - compose infra.logged.logged
```

`wire <id>` names either a function that is called with an object of named dependencies or a class that is constructed with that object. Each child line `<alias> <id>` is one dependency. An id that has no `wire` line of its own is a leaf and is built with no arguments. A line `when env.NAME = value → <id>` picks another implementation when the variable has exactly that value; the first match wins, and the dependency line itself is the fallback when nothing matches. `compose <id>` wraps the value. When there are several `compose` lines, they apply in source order, with the first one closest to the value.

Mistakes in the section turn into diagnostics. An unknown id is K001, and a repeated `wire` id is K002. A cycle among factories is K301. K302 means the generated file cannot build the target, because it is a module, a type, Python or Rust code, an instance method, or a name the module does not export; a static method, however, is allowed. A `deny` rule between a factory and one of its dependencies is K102.

`keylang wire` will not overwrite a file that lacks the `// keylang:generated` marker and exits with code 1 instead. If the section has any diagnostic, nothing is written. `--check` only compares and writes nothing. The generated file is an ordinary module in whatever layer its path falls into, so the same `deny` rules apply to it. Its types are checked by `tsc`, not by keylang.

Wiring does not isolate modules: a hand-written import simply bypasses `wire()`, and it is the rules that catch such imports. Rust generation and request-scoped lifetimes have been designed but are not in the tool yet.

## The terminal and the browser

Run `keylang` with no command and it opens the UI when stdin and stdout are a terminal; otherwise it prints usage and exits with code 2. `keylang web` serves the same UI at `http://127.0.0.1:7070/#t=<token>`. The token sits in the URL fragment, which the browser does not send to the server. Localhost is the default. If you choose another `--host`, only the token protects the UI, so for remote use an SSH tunnel to localhost is the safer setup.

The screen shows the spec, a gutter with a mark beside each line, a status line, and a tree. `?` opens the list of keys:

![Keys for view mode](images/tui-help.png)

`?` opens that list, and Esc closes it again:

![The key list, then Esc](images/tui-keys.gif)

| Key | Action |
|---|---|
| `↑` `↓` or `j` `k` | Move |
| `Enter` | Open the code for the id |
| `K` or hover | Show the signature, the file, the evidence |
| `Tab` | Editor, then the tree, then the file list |
| `F2` / `F3` | Show or hide the file list / the navigation panel |
| `F5` | Analyze again |
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

`Enter` on an id opens a read-only viewer when no `$EDITOR` is set, and always does so in `keylang web`. In a terminal with `$VISUAL` or `$EDITOR` set, that editor is used instead. `Esc` takes you back:

![cli.cli.main opened from the trigger](images/tui-code.png)

While you edit, `Ctrl+S` writes the file and `Ctrl+Space` completes keywords and ids. `Ctrl+G` turns the selected prose into `step`, `when` / `then`, `invariant` or `emits` lines. It does not call a model: it only recognizes ids the snapshot already has, plus a few cue words (`when`, `if`, `коли`, `якщо`).

`keylang web <url>` first clones the repository the way `keylang clone` does (see [the first hour](existing/01-the-first-hour.md)) and then serves the UI on the clone.

The repository has a `Dockerfile` for running keylang with git inside a container. Clones go to the `/cache` volume, and `/work` is the folder you mount:

```sh
docker build -t keylang .
docker run --rm -v keylang-cache:/cache keylang clone https://github.com/owner/repo
docker run --rm -p 127.0.0.1:7070:7070 -v keylang-cache:/cache keylang web https://github.com/owner/repo --host 0.0.0.0
docker run --rm -v "$PWD":/work keylang check
```

Inside a container the server has to listen on `0.0.0.0`, so the token is the only guard; `127.0.0.1:` in `-p` keeps the port on your machine. In the printed URL, replace `0.0.0.0` with `localhost`.

`keylang lsp` serves the same diagnostics over stdio. The client in `editors/vscode/` is a thin wrapper around it; it is not published in the Marketplace and is not part of the npm package.

## Agents

keylang does not launch an agent. Instead, `init` and `keylang agents` write a short instruction block and, where they find Claude, Codex, Cursor or opencode, also install the MCP server and the skill. Which directories they look for is listed in [lesson 2](02-install-and-check.md). The division of work stays the same: you write the spec, the agent generates the program from it, and you do not write the functions yourself. Whatever the agent produces, `check` still has the final word.

A feature file is an ordinary spec. `keylang feature <slug>` reports the feature as done when every `planned` item is implemented, every step is static `ok`, and no rule `fail` remains. Tests and traces are shown, but they do not block it.

For Claude and Codex, keylang also installs a Stop hook, which runs when the agent is about to finish. `keylang hook stop` runs the check on what changed. If a new `fail` appeared, it answers `decision: block`, so the agent has to keep working. If there is no new `fail`, or the same event arrives again with `stop_hook_active: true`, it answers `{}`. Either answer is JSON with exit code 0. An unverified line does not block. Cursor uses Claude's hooks, while opencode does not get a Stop hook at all.

Hand-written rules change only through a proposal. `apply_diff` stores the new text and leaves the file itself untouched until you merge it, and it refuses to touch a generated file.

| Command | What it proposes | What it will not do |
|---|---|---|
| `draft flow <trigger>` | A flow under `.keylang/proposals/` | It does not edit the spec. `--mode algo` follows resolved calls to depth 4 |
| `draft rules` | Rules the code already satisfies, or the model's rules tagged `agree`, `conflict`, `llm-only` | It does not weaken a `deny` you wrote unless you merge that hunk |
| `draft map` | Nothing; it only prints a layout | The file changes only when you edit it |
| `code-to-spec <file:line>` | Flows for the function, or for every exported function | `--since <git-ref>` limits the draft to functions the diff touches |
| `spec-to-code <id>` | A stub and failing tests for a `planned fn` | Files are written only with `--apply`, not by default |
| `explain <id> --llm` | `keylang/explain/<id>.md` | It never changes a verdict |

`keylang mcp` serves search, node, code, flows, check, explain, context, `validate_spec`, `scaffold`, `feature_status`, and `apply_diff`. Of these, only `apply_diff` writes anything, and what it writes is only a proposal.

In the UI, `m` opens the diff. `a` accepts a hunk, `r` rejects it, and `w` writes the accepted hunks. A hunk you have not decided on is not applied.

In view mode, `Ctrl+Space` on a flow that has a trigger asks the model for a draft and opens the merge. This needs `agent` to be set in `keylang.json`. After you merge, `check` evaluates the new steps like any other steps, so a line the snapshot does not support becomes `unverified` or `fail`, never `ok`.

Ghost text is a single suggested line at the end of a fresh `- ` bullet, and `Tab` inserts it. Voice input (`Ctrl+R` while editing) is optional, and `keylang doctor` tells you which engine is set. Neither of them writes a file on its own.

So let the tool propose, read each hunk, and accept the ones that say what you meant. When in doubt, believe `check`, not a comment saying that a model wrote the line.

Next: [the sessions](08-use-cases.md).
