# 8. Use cases

[Course](README.md) · **English** · [Українською](uk/08-use-cases.md)

Four sessions, from this repository and from `examples/shop`. You write the spec in them. The agent generates the functions. You do not. Each session says what to run, what the picture shows, and the decision it supports.

The UI captures are `keylang web` on 2026-09-28. Trace and test files under `.keylang/` were stale. The CLI summary of that same tree was `0 fail, 22 unverified, 43 ok`.

## 1. A renamed module

Someone writes `order domain.aggregate` under `application.purchase`. The module in the map is `orderAggregate`.

```sh
node bin/keylang.js check examples/shop
```

![K001 dangling reference domain.aggregate](images/cli-shop-k001.png)

The first line is the decision: a typo or a stale name, and the process fails. The hint is the nearest id. The second line is a different fact. The example ships no TypeScript, so the checkout flow cannot be proved. Fix the id (see `examples/shop-fixed`) or, if the module really does not exist yet, declare `planned` and accept `unverified` until the code arrives.

```sh
node bin/keylang.js explain K001
```

![What K001 means](images/cli-explain-k001.png)

The UI shows the same paragraph when you press `?` on the diagnostic.

After the fix the process exits 0 and the flow is still not proved:

![Exit 0, one unverified, because there is no snapshot](images/cli-shop-fixed.png)

Do not read that as "the shop is verified." Read it as "the names that can be resolved do resolve, and there is no code to check the rules against."

## 2. A layer rule you want CI to keep

This repository's rule: the parser and the checker do not import the tree-sitter extractor, and they do not import `web-tree-sitter` directly. The TUI asks the analysis for facts. It does not parse source itself.

![Rules file with a green gutter](images/tui-rules.png)

- The gutter on the rule lines is `✓`. Every criterion held.
- The colors follow the layer order in `keylang.json`.
- The tree on the right is the snapshot, not a drawing.
- The status line is `✗ 0  ◌ 22  ✓ 11`. Zero failing lines. Twenty-two lines whose worst mark is unverified. Eleven lines fully ok. Those eleven are the rules.

In CI, run both. Neither writes files:

```sh
node bin/keylang.js check
node bin/keylang.js map --check
```

`check` fails if a new import crosses a `deny`. `map --check` fails if someone changed the code and did not regenerate the map. A pull request that adds `import web-tree-sitter` from `src/parser.ts` fails with K102 on that import. The rules file stays the explanation.

`draft rules` can suggest a `layers` line from whatever the code does today. Treat that as a description of the present. Edit it into the rule you want before you merge it.

## 3. A flow that is partly proved

Open `keylang/flows/check.md` and put the cursor on the trigger.

![Trigger line with ID ok and trace unverified](images/tui-flow.png)

| Mark | Reading |
|---|---|
| `ID ✓` | `cli.cli.main` is in the fresh snapshot |
| `static —` | Not reported. A trigger has no parent call |
| `tests —` | Not reported on this line |
| `trace ◌` | Reported, and the trace file belongs to another snapshot |

A single green badge would have hidden the stale trace. The yellow line names `.keylang/trace/check.jsonl` and the old snapshot id.

![Hover: id ok, trace unverified](images/tui-hover.png)

`Enter` opens the function. The viewer is read-only. `Esc` goes back. It does not edit the TypeScript.

![main at src/cli.ts:114](images/tui-code.png)

To make the trace `ok`, run the suite so the reporter rewrites `.keylang/` for the current `snapshotId`, then `check` again. Until the hashes match, the honest mark is `◌`. Pass `--strict` if the pipeline must refuse that. If you have not adopted traces, delete `check.trace` from `keylang.json` and the kind stops being reported.

The same shape in the CLI, middle cut:

![CLI: ID ok, static ok, trace unverified](images/cli-check-repo.png)

`static ok` on `cli.cli.run` is the call from `main`. Further down, `generateMap` is reached through the default of the hook `generate`. `--static=behavior` counts that. `--static=shape` would not. The summary `0 fail, 22 unverified, 43 ok` matches the UI once you remember the UI counts lines and the CLI counts results.

![explain cli.cli.cmdCheck](images/cli-explain-id.png)

## 4. Reading the repository before editing it

1. `keylang web`, or `keylang` in the terminal.
2. `:` and type part of a path.

   ![Palette filtered with "rules"](images/tui-palette.png)

   The same gesture, then the cursor walks down the denies. Recorded after `npm test`, so the status line is all green:

   ![Opening the rules and walking down](images/tui-rules.gif)

3. `F2` for the list. Specs sit above the generated map.

   ![File list](images/tui-files.png)

4. On a generated map, `Enter` on a function. The file is `generated, read-only`. Change the source, then `keylang map`. Do not hand-edit the Markdown.

   ![lang layer map](images/tui-map.png)

5. `v` to read the prose as a document. The gutter remains.

   ![Reading mode](images/tui-read.png)

6. `?` when you forget a key. Esc closes the list.

   ![The key list, then Esc](images/tui-keys.gif)

Then `i` to change a rule, `Ctrl+S` to write it. `keylang init` on a checkout the agent has not seen writes the baseline and, where a harness is already present, the MCP server. keylang does not launch the agent. Drafts land in `.keylang/proposals/`. You merge with `m`.

## 5. Words on the map, and a feature that is not done

No screenshot for this one.

Turn on `"explain": {"map": true}`, run `keylang map`, open a layer file and press `t`. Same tree, with a doc comment or a saved brief under each node. `s` finds a node by id or by those words. `check` does not read `keylang/map-explained/`. A green run is not a claim that the paragraph is true.

A piece of work that is not in the code yet is `keylang/features/<slug>.md`: `planned` ids and a flow. You write that file. An agent generates the functions from it. You do not write them. keylang does not start the agent. An integration nobody imports is `planned module external.<pkg>` and a step from the module that will import it. `keylang feature <slug>` is done when those declarations are implemented, the steps are static `ok`, and no rule fails. The tests and the trace are listed beside that answer. They do not decide it.

## When to leave it alone

keylang earns its keep when people already argue about layers, and you want that argument to fail a pull request. It is a poor fit when:

- The codebase is one layer, or the boundaries move every week and nobody will update ids.
- The bugs you care about never show up as an import or a call between modules.
- You need a language the frontends do not parse. A project made entirely of holes will report `unverified` forever.
- You want the prose checked against the code. That check is not implemented. The bullets are what `check` reads.
- You want a runtime injector for Rust. `keylang wire` emits one TypeScript composition root.

A small adoption that still pays: `keylang.json`, a short `rules.md` with `layers` and two or three `deny` lines, `check` and `map --check` in CI, and no flows until a scenario is worth a trace.
