# 7. Wiring, the UI, and agents

[Course](README.md) · **English** · [Українською](uk/07-tools.md)

Rules and flows check the code the agent generated. You wrote the spec, not the functions. keylang does not start the agent. Three more surfaces sit on the same analysis: a wiring generator, the terminal and browser, and the agent tools. None of them invent a second verdict.

## Wiring

`# wiring` lists factories. `keylang wire` writes `keylang.gen.ts`: a typed `async function wire(env)` that builds each factory once, dependencies first. There is no container and no lookup by string. The contract is [ADR 0003](../adr/0003-wiring-lifecycle.md).

```markdown
# wiring

- wire app.purchase.createPurchase
  - store domain.store.Store
- wire domain.store.Store
  - db infra.db.createDb
    - when env.DB = memory → infra.memory-db.createMemoryDb
    - compose infra.logged.logged
```

`wire <id>` is a function called with an object of named dependencies, or a class constructed with that object. A child `<alias> <id>` is one dependency. An id with no `wire` of its own is a leaf, built with no arguments. `when env.NAME = value → <id>` picks another implementation when the variable has that exact value. The first match wins. The line itself is the fallback. `compose <id>` wraps the value. Several `compose` lines apply in source order, the first closest to the value.

An unknown id is K001. A repeated `wire` id is K002. A cycle among factories is K301. K302 is a target the generated file cannot build: a module, a type, Python or Rust, an instance method, a name the module does not export. A static method is allowed. A `deny` between the factory and a dependency is K102.

`keylang wire` will not overwrite a file that lacks the marker `// keylang:generated` (exit 1). Any diagnostic on the section writes nothing. `--check` compares and writes nothing. The generated file is an ordinary module in whatever layer its path falls into, so the same `deny` rules apply. `tsc` typechecks it. keylang does not.

Wiring does not isolate modules. A hand-written import bypasses `wire()`. The rules catch those imports. Rust generation and request-scoped lifetimes are designed and not in the tool.

## The terminal and the browser

`keylang` with no command opens the UI when stdin and stdout are a terminal, and prints usage with exit code 2 otherwise. `keylang web` serves the same UI at `http://127.0.0.1:7070/#t=<token>`. The token is in the URL fragment. The browser does not send that to the server. Localhost is the default. Another `--host` is protected only by the token. An SSH tunnel to localhost is the safer remote setup.

The screen is the spec, a gutter, a status line, and a tree. `?` opens the keys:

![Keys for view mode](images/tui-help.png)

`?` opens that list. Esc closes it:

![The key list, then Esc](images/tui-keys.gif)

| Key | Action |
|---|---|
| `↑` `↓` or `j` `k` | Move |
| `Enter` | Open the code for the id |
| `K` or hover | The signature, the file, the evidence |
| `Tab` | Editor, then the tree, then the file list |
| `F5` | Analyze again |
| `v` | Reading mode. The gutter stays tied to source lines |
| `i` | Edit. Generated maps refuse |
| `/` then `n` | Search this buffer |
| `:` | Command palette. `open keylang/rules.md` jumps to a file |
| `t` | On a layer file, switch between the map and the explained map |
| `s` | Find a node by id or by words in its note |
| `m` | Merge the proposal for this file, hunk by hunk |
| `q` | Quit |

![Command palette filtered to the rules file](images/tui-palette.png)

![Reading mode on the rules](images/tui-read.png)

![File list beside the generated map](images/tui-files.png)

`Enter` on an id opens a read-only viewer when no `$EDITOR` is set, and always in `keylang web`. In a terminal, `$VISUAL` or `$EDITOR` is used instead. `Esc` returns:

![cli.cli.main opened from the trigger](images/tui-code.png)

While editing, `Ctrl+S` writes. `Ctrl+Space` completes keywords and ids. `Ctrl+G` turns selected prose into `step`, `when` / `then`, `invariant` or `emits` lines. It does not call a model. It only recognizes ids the snapshot already has, plus a few cue words (`when`, `if`, `коли`, `якщо`).

`keylang lsp` speaks the same diagnostics over stdio. The client in `editors/vscode/` is a thin wrapper. It is not in the Marketplace and not in the npm package.

## Agents

keylang does not launch an agent. `init` and `keylang agents` write a short block and, where they find Claude, Codex, Cursor or opencode, the MCP server and the skill. Which directories count is in [lesson 2](02-install-and-check.md). You write the spec. The agent generates the program from it. You do not write the functions. `check` still decides.

A feature file is an ordinary spec. `keylang feature <slug>` is done when every `planned` is implemented, every step is static `ok`, and no rule `fail` remains. Tests and traces do not block.

Claude and Codex also install a Stop hook. `keylang hook stop` runs the changed check. A new `fail` answers `decision: block`. No new `fail`, or the same event with `stop_hook_active: true`, answers `{}`. Either answer is JSON and exit code 0. An unverified line does not block. Cursor uses Claude's hooks. opencode does not get a Stop hook.

Hand-written rules change only as a proposal. `apply_diff` stores the new text and leaves the file until you merge. It refuses a generated file.

| Command | What it proposes | What it will not do |
|---|---|---|
| `draft flow <trigger>` | A flow under `.keylang/proposals/` | It does not edit the spec. `--mode algo` follows resolved calls, depth 4 |
| `draft rules` | Rules the code already satisfies, or the model's rules tagged `agree`, `conflict`, `llm-only` | It does not weaken a `deny` you wrote unless you merge that hunk |
| `draft map` | Nothing. It prints a layout | The file changes only when you edit it |
| `code-to-spec <file:line>` | Flows for the function, or every exported function | `--since <git-ref>` limits the draft to functions the diff touches |
| `spec-to-code <id>` | A stub and failing tests for a `planned fn` | `--apply` writes the files. The default does not |
| `explain <id> --llm` | `keylang/explain/<id>.md` | It never changes a verdict |

`keylang mcp` serves search, node, code, flows, check, explain, context, `validate_spec`, `scaffold`, `feature_status`, and `apply_diff`. Only `apply_diff` writes, and only a proposal.

In the UI, `m` opens the diff. `a` accepts a hunk, `r` rejects it, `w` writes the accepted hunks. A hunk you have not decided is not applied.

`Ctrl+Space` in view mode, on a flow that has a trigger, asks the model for a draft and opens the merge. It needs `agent` in `keylang.json`. After you merge, `check` evaluates the new steps like any other steps. A line the snapshot does not support becomes `unverified` or `fail`, not `ok`.

Ghost text is one suggested line at the end of a fresh `- ` bullet. `Tab` inserts it. Voice (`Ctrl+R` while editing) is optional. `keylang doctor` says which engine is set. Neither writes a file by itself.

Let the tool propose. Read the hunk. Accept the ones that say what you meant. Believe `check`, not the comment that says a model wrote the line.

Next: [the sessions](08-use-cases.md).
