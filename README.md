# keylang

**English** · [Українською](README.uk.md)

![Ключ до розробки і розуміння проектів](docs/course/images/banner.png)

keylang is Markdown next to the code. You write the spec: which part of the program may know about which, and which scenario should still happen. You do not write the functions. An agent generates the code from that spec. keylang does not start the agent. keylang checks that the generated code still matches.

Take a shop. The screen starts a purchase. The purchase asks the order rules to build an order. The order rules do not know the screen or the database. That last sentence is a rule. When the code breaks it, the check can fail the build.

`:`, then `rules`, then Enter. The cursor walks down to the denies:

![Opening the rules and walking down](docs/course/images/tui-rules.gif)

`/` finds `cli.cli.main`. Down one line, `K` opens the function:

![Search, then K on the next step](docs/course/images/tui-flow.gif)

`?` lists the keys. Esc closes the list:

![The key list, then Esc](docs/course/images/tui-keys.gif)

These clips were recorded after `npm test`. The trace matches, so the status line reads `✗ 0  ◌ 0  ✓ 34`.

New to these words? Start with the [pre-course](docs/course/pre/README.md) ([українською](docs/course/pre/uk/README.md)). The guide is the [course](docs/course/README.md) ([українською](docs/course/uk/README.md)). Adding a feature to a repo that already exists: [that track](docs/course/existing/README.md) ([українською](docs/course/existing/uk/README.md)). Starting a Telegram bot, a Python CRUD, or a NestJS app: [that track](docs/course/from-scratch/README.md) ([українською](docs/course/from-scratch/uk/README.md)). The exact grammar is [`docs/format.md`](docs/format.md) (Ukrainian). Commands are in [`docs/tools.md`](docs/tools.md). An agent installs keylang and follows the use / don't-use rules from [`llm.txt`](llm.txt) ([raw](https://raw.githubusercontent.com/Ivlad003/keylang/master/llm.txt)). The target, including work not built yet, is [`docs/design.md`](docs/design.md).

You need Node.js ≥ 22.18. In this checkout, `node bin/keylang.js` runs the TypeScript as it is. A published package is plain JavaScript: `prepack` compiles `src/` to `dist/` before publish. Nothing native is compiled on your machine.

## What you write

| File | Who writes it | What it is |
|---|---|---|
| `keylang/map/*.md` | `keylang map` | Layers, modules, functions, links to source lines. Do not edit |
| `keylang/rules.md` | you | Who may depend on whom: `layers`, `allow`, `deny`, `entry`, `exports`, `no-cycles` |
| `keylang/flows/*.md` | you | One scenario. Each step reports `ID`, `static`, `tests` and `trace` on its own |
| `keylang/features/*.md` | you | What to build. `keylang feature <slug>` says when it is done |
| `.keylang/proposals/` | an agent | A draft of the spec. A person merges it piece by piece |
| the program | an agent | The functions, generated from the spec. You do not write them. keylang does not start the agent |

An id looks like `application.purchase.buy`. It names the layer, the module and the function. It is not a line number, so the text survives edits that only move lines.

With `"explain": {"map": true}` in `keylang.json`, `keylang map` also writes `keylang/map-explained/`: one or two sentences under each node, from the doc comment, or from a saved note that names the model and the date.

## Three answers

- `ok` — the claim held where keylang looked.
- `fail` — a break was shown. Exit code 1.
- `unverified` — neither. A hole, a missing file, or an old trace. Not a pass. `--strict` turns it into exit code 1.

Exit codes: `0` no blocking finding, `1` a violation (a stale map with `map --check`, or any `unverified` with `--strict`), `2` bad usage or a file error. `parse --json` writes only JSON to stdout. `check` writes findings to stdout and the summary to stderr.

keylang does not decide whether the program is correct, safe, or finished.

- A sentence under a node is prose. keylang keeps it. It does not prove it.
- A call it cannot name (`obj[k]()`, an unknown decorator, `eval`) is a hole. The answer stays `unverified`.
- Rust and Python record imports and calls. They do not record type edges.
- Wiring writes a TypeScript `wire()`. It does not stop the rest of the program from importing what it wants. The rules still have to catch that.
- keylang reads test reports and traces. It does not run the tests, typecheck, or review security.
- Go, Java, Ruby and the rest are absent from the snapshot. Absence is not a proof that they depend on nothing.

## Try it

```sh
npx keylang init .      # guess layers, write keylang.json, build the map
npx keylang check       # ids and rules under keylang/
npm i -g keylang        # then just `keylang …`
```

From this checkout:

```sh
npm install
node bin/keylang.js map                  # rewrite keylang/map/*.md and .keylang/index.json
node bin/keylang.js map --check          # CI: exit 1 when the map is stale
node bin/keylang.js check                # writes nothing
node bin/keylang.js check --strict       # unverified becomes a failure
node bin/keylang.js explain K001         # what a code means and how to fix it
node bin/keylang.js                      # terminal UI (? lists keys, q quits)
node bin/keylang.js web                  # the same UI in a browser; open the printed URL
```

`examples/shop` keeps a wrong id, `domain.aggregate`, on purpose. There is no code snapshot, so the flow cannot be proved either. Exit code 1:

![check examples/shop reports K001](docs/course/images/cli-shop-k001.png)

`examples/shop-fixed` corrects the id. That folder still has no TypeScript, so the rules stay `unverified` (`no snapshot`) and the check exits 0:

![shop-fixed exits 0 with unverified evidence](docs/course/images/cli-shop-fixed.png)

The still pictures below are `node bin/keylang.js web` on this repository, 2026-09-28. The local trace and the `node:test` report were older than the snapshot, so those marks are `unverified`. That is the honest result. The status line counts lines (the worst mark on the line). `keylang check` counts every evidence result. The same run prints `0 fail, 22 unverified, 43 ok` while the UI shows `✗ 0  ◌ 22  ✓ 11`. The clips at the top are a later run.

Rules for this repository. The language core (`lang`, `base`) and the checker must not depend on the extractor or on tree-sitter:

![Rules with a passing gutter and the layer tree](docs/course/images/tui-rules.png)

The `check` flow. The id is exact. There is no static parent to prove. The trace file is from an older snapshot:

![Flow check with the evidence gutter](docs/course/images/tui-flow.png)

`K`, or a mouse hover, shows the signature, the file and a few lines of the declaration:

![Hover on cli.cli.main](docs/course/images/tui-hover.png)

More pictures are in [course lesson 8](docs/course/08-use-cases.md).

## What it costs

The grammar is a short slice of Markdown. A word means what its parent line allows. A full code fence inside a list item is not supported. `keylang fmt` will not reformat a file whose nesting it does not trust, so what GitHub shows and what `check` believes stay aligned after `fmt`.

You update ids yourself when a module is renamed or moves between layers. The map shows modules and dependencies. Deployments, data shapes and the reason for a decision stay in prose or an ADR.

Exit code 0 means no blocking finding. Without `--strict` it still allows `unverified`.

## What kind of language

keylang is a list, not a programming language. There are no variables and no loops, so a file can be read to the end. A bad line gets a code (K001–K302) and parsing goes on. `keylang explain` says what the code means.

It grew out of the Markdown form of Timur Shemsedinov's architecture language. How it sits next to import-linter, ArchUnit, Structurizr and the rest is in [`docs/research-pl.md`](docs/research-pl.md) (Ukrainian).

## What is built

The short list. Detail is in [`docs/design.md`](docs/design.md) §9.

- **M0.** The format, the parser, ids across files, codes K001–K006, `fmt`. The language core does not import tree-sitter.
- **M1.** Map and rules for TypeScript and JavaScript. Codes K101–K105. This repository's own `keylang check` has no violations.
- **M2–M3.** Flows with `ID`, `static`, `tests` and `trace`. `planned` nodes (K201, K202). One analysis for the CLI, the LSP, MCP and the UI. A thin VS Code client lives in `editors/vscode/`. It is not on the Marketplace and not in the npm package.
- **M4.** The terminal UI and `keylang web`.
- **M5.** Rust and Python on the same graph, with the limits above. Trace adapters in `adapters/python` and `adapters/rust`. `keylang trace-plan <flow>` prints what to instrument.
- **M6.** `# wiring` writes a typed `wire()` in `keylang.gen.ts` ([ADR 0003](docs/adr/0003-wiring-lifecycle.md)).
- **M7.** `draft`, `code-to-spec`, `spec-to-code` and `explain <id> --llm` write proposals. `keylang mcp`: `apply_diff` writes a proposal only. Optional voice (`Ctrl+R`). `keylang doctor` reports and changes nothing.
- **M8.** `init` and `keylang agents` install a short block in `AGENTS.md`, the MCP server and a skill for Claude Code, Codex, Cursor or opencode ([ADR 0005](docs/adr/0005-harness-integration.md)). `keylang baseline` writes `keylang/rules.baseline.md`: layer dependencies the graph does not have yet. `check --changed` and `keylang hook stop` block a turn only on a new violation. Covered by the CLI and MCP tests. Not yet tried end to end with Claude Code and Codex on an outside repository.

`bench/` runs the tool on eight repositories. Numbers are in [`bench/results.md`](bench/results.md).

## Tests

```sh
npm test            # node:test, through the real CLI
npm run typecheck   # tsc --noEmit
```

The terminal UI is tested without a real terminal (`tests/tui.test.ts`). `keylang web` is tested through the CLI and a WebSocket (`tests/web.test.ts`).

Publishing from a clean checkout: `npm test && npm run typecheck`, then `npm version patch` (or minor, or major) and `npm publish`. `prepack` builds `dist/`. Look at the tarball with `npm pack` before you publish.
