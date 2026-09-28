# keylang

**English** · [Українською](README.uk.md)

![Ключ до розробки і розуміння проектів](docs/course/images/banner.png)

Architecture description that lives in the repository as ordinary Markdown: a generated map of layers and modules, hand-written dependency rules, and logic flows, all checked against the code. The teaching guide is the [course](docs/course/README.md) ([українською](docs/course/uk/README.md)). The normative grammar is [`docs/format.md`](docs/format.md) (Ukrainian). The target design is [`docs/design.md`](docs/design.md); the research notes are [`docs/research.md`](docs/research.md).

Stack: Node.js ≥ 22.18 and TypeScript. In this checkout Node runs `.ts` directly (`node bin/keylang.js`). Before publish, `prepack` compiles `src/` to `dist/` and rewrites relative `.ts` imports to `.js`. An installed package loads that JavaScript and compiles nothing on the user's machine. Distribution is npm / npx. No native compilation.

## What problem it is for

A repository already has the structure. What it usually lacks is a short text, reviewed like code, that says which layer may depend on which, and a check that fails when the code drifts. keylang is that text plus the check.

| Job | How keylang does it |
|---|---|
| See the repository | `keylang map` writes `keylang/map/<layer>.md`: layers, modules, functions, imports and calls, with links to source lines |
| Read what each node does | With `"explain": {"map": true}` in `keylang.json`, `keylang map` also writes `keylang/map-explained/`: the same tree with a one- or two-sentence explanation under each node, from its doc comment or a saved model brief marked with model and date |
| Forbid a dependency | Hand-written `keylang/rules.md` (`layers`, `allow`, `deny`, `entry`, `exports`, `no-cycles`) is evaluated on the current snapshot |
| Name a scenario | A `# flow` lists a trigger and steps by stable ids. Each step reports `ID`, `static`, `tests` and `trace` separately |
| Keep the map honest in CI | `keylang map --check` exits 1 when the committed map is stale. `keylang check` exits 1 on a violation |
| Let an agent draft, not overwrite | `draft`, `code-to-spec`, `spec-to-code` and the MCP `apply_diff` tool write a proposal under `.keylang/proposals/`. A person merges it hunk by hunk |
| Jump from the name to the function | The same analysis serves the CLI, the terminal UI, `keylang web`, the LSP server and the MCP server |

Ids look like `application.purchase.buy`. They are a dotted path from the layer, not a line number, so a spec survives edits that only move lines.

## What it does not do

keylang checks claims about structure and about evidence you attached. It does not decide whether the program is correct, safe, or finished.

- Descriptions under a node are prose. They are kept and formatted. They are not proved. A "prose went stale" check is designed and not implemented.
- A dynamic call, an unknown decorator or attribute macro, `eval`, or a module the frontend could not read is a hole in coverage. The verdict is `unverified`, which is not a pass and not a failure. `--strict` is what turns `unverified` into exit code 1.
- Rust and Python frontends record imports, calls and re-exports. They do not record type edges. A call whose receiver keylang cannot name stays a hole.
- Wiring generates a TypeScript `wire()` function. It does not generate Rust, and it does not stop the rest of the program from importing whatever it wants. The dependency rules still have to catch that.
- An LLM explanation or a drafted flow is provenance. `check` does not treat it as evidence.
- keylang reads test reports and traces. It does not replace the test runner, the typechecker, or a security review.
- Languages outside TypeScript, JavaScript, Python and Rust are not indexed. A file in another language is absent from the snapshot, which is not a proof that it has no dependencies.

## Strengths and costs

**Strengths**

- Specs are Markdown. GitHub renders them, and review is a normal diff.
- The generated map and the hand-written specs are different files. `keylang map` will not overwrite a file that lacks the `keylang:generated` marker.
- One analysis (`analyze()`) feeds the CLI, LSP, terminal, browser and MCP tools, so a gutter mark and a CI line are the same verdict.
- Missing evidence stays `unverified`. The tool does not upgrade a gap to "ok".
- Agent writes land in `.keylang/proposals/` until a person accepts a hunk.
- Install does not compile native code. Voice support is optional.

**Costs**

- The grammar is a narrow slice of Markdown. Keywords mean different things depending on the parent line. Full CommonMark nesting (a code fence inside a list item) is not supported.
- You maintain ids yourself when a module is renamed or moves between layers.
- The map is a module-and-dependency view. It does not describe deployment, data shapes, or why a decision was made. That belongs in prose or an ADR.
- Useful flow evidence beyond "this id exists and a static call path reaches it" needs a test report and a trace from the same snapshot. A stale trace is `unverified`, as in the screenshots below.
- Four languages, each with stated blind spots. Other languages are out of scope.
- Exit code 0 means "no blocking finding". Without `--strict` it still allows `unverified`.

## Screenshots

Captured from this repository with `node bin/keylang.js web` on 2026-09-28, plus the CLI on `examples/shop`. The trace and the `node:test` report under `.keylang/` were stale relative to the snapshot, so trace and test evidence are `unverified`. That is the intended result, not a display bug. The status line counts lines (worst mark on the line). `keylang check` counts every evidence result, so the same run prints `0 fail, 22 unverified, 43 ok` while the UI shows `✗ 0  ◌ 22  ✓ 11`.

Rules for this repository, with a passing gutter. The language core (`lang`, `base`) and the checker are not allowed to depend on the extractor or on tree-sitter:

![Rules with a passing gutter and the layer tree](docs/course/images/tui-rules.png)

The `check` flow. The cursor line expands into separate `ID`, `static`, `tests` and `trace` marks. Here the id is exact and there is no static parent to prove; the trace file is from an older snapshot:

![Flow check with the evidence gutter](docs/course/images/tui-flow.png)

`K` (or a mouse hover) shows the signature, the file, the evidence and a few lines of the declaration:

![Hover on cli.cli.main](docs/course/images/tui-hover.png)

The slide example keeps a wrong id on purpose. There is no code snapshot, so the flow cannot be proved either. Exit code is 1:

![check examples/shop reports K001](docs/course/images/cli-shop-k001.png)

More captures (help, generated map, reading mode, code viewer, command palette, file list, `explain`) are in [course lesson 8](docs/course/08-use-cases.md).

## Install and first run

Node.js ≥ 22.18 is enough.

```sh
npx keylang init .      # guess layers, write keylang.json, build the map
npx keylang check       # ids and rules under keylang/
npm i -g keylang        # then just `keylang …`
```

From this checkout:

```sh
npm install
node bin/keylang.js init path/to/repo
node bin/keylang.js map                  # rewrite keylang/map/*.md and .keylang/index.json
node bin/keylang.js map --check          # CI: exit 1 when the map is stale
node bin/keylang.js check                # ids, rules and flows; writes nothing
node bin/keylang.js check --strict       # unverified becomes a failure
node bin/keylang.js explain K001         # what a code means and how to fix it
node bin/keylang.js explain cli.cli.main # what the snapshot says about an id
node bin/keylang.js                      # terminal UI (? lists keys, q quits)
node bin/keylang.js web                  # the same UI in a browser; open the printed URL
```

Exit codes: `0` no blocking finding, `1` a violation (or a stale map with `--check`, or any `unverified` with `--strict`), `2` bad usage or I/O. `parse --json` writes only JSON to stdout. `check` writes findings to stdout and the summary to stderr.

`examples/shop` is the slide example with the bad id `domain.aggregate`. `examples/shop-fixed` corrects it. Neither directory contains the TypeScript it names, so rules there are `unverified` (`no snapshot`) and a clean id check still exits 0:

![shop-fixed exits 0 with unverified evidence](docs/course/images/cli-shop-fixed.png)

The course walks through the language, the rules, the flows and these commands with the screenshots: [docs/course](docs/course/README.md).

## What is implemented

Milestone detail lives in [`docs/design.md`](docs/design.md) §9 and the normative behavior in [`docs/format.md`](docs/format.md). The short form:

- **M0.** Format, Markdown → IR parser with positions, cross-file id resolution, diagnostics K001–K006, `keylang fmt`. Public API in `src/index.ts`. The language core does not import tree-sitter.
- **M1.** Map and rule check for TypeScript and JavaScript (ESM and CommonJS). Facts come from `web-tree-sitter` and the wasm grammars in `@vscode/tree-sitter-wasm`. Import resolution covers relative paths, `tsconfig` `paths` / `baseUrl` / `extends`, `package.json` `imports`, packages and Node built-ins. Rules produce K101–K105. This repository describes itself in `keylang.json` and `keylang/`; `keylang check` at the root is clean of violations.
- **M2–M3.** `# flow` with separate `ID`, `static`, `tests` and `trace` evidence, three verdicts (`ok`, `fail`, `unverified`), `planned` nodes (K201/K202). `analyze()` is shared by the CLI, LSP, MCP and TUI, with a fact cache under `.keylang/`. `keylang lsp` and a thin VS Code client in `editors/vscode/` (not published to the Marketplace, not part of the npm package).
- **M4.** Terminal UI and `keylang web` (xterm.js over a WebSocket, access token, reconnect). Raw Markdown with a gutter, mouse and `K` hover, jump to code, edit with completion, `Ctrl+G` text → spec, hunk merge of proposals.
- **M5.** Rust (crates, `use`, `pub use`) and Python (packages, `__all__`) on the same graph, with explicit limits. Trace adapters in `adapters/python` and `adapters/rust`. `keylang trace-plan <flow>` prints what to instrument.
- **M6.** `# wiring` and `keylang wire`: a typed `wire()` in `keylang.gen.ts` that builds each factory once, dependencies first, with async init/dispose and a hard failure on cycles ([ADR 0003](docs/adr/0003-wiring-lifecycle.md)).
- **M7.** `draft`, `code-to-spec`, `spec-to-code`, `explain <id> --llm` as proposals. `keylang mcp` for agents (`apply_diff` writes a proposal only). Optional voice (`Ctrl+R`). `keylang doctor` reports languages, agent credentials and voice without changing anything.

`bench/` runs the tool on eight repositories; numbers are in [`bench/results.md`](bench/results.md).

## Tests

```sh
npm test            # node:test, CLI end to end
npm run typecheck   # tsc --noEmit
```

The TUI is tested without a TTY (`tests/tui.test.ts`). `keylang web` is tested through the real CLI and a WebSocket (`tests/web.test.ts`).

Publishing a release, from a clean checkout: `npm test && npm run typecheck`, then `npm version patch` (or minor/major) and `npm publish`. `prepack` builds `dist/`. Check the tarball with `npm pack` before publishing.
