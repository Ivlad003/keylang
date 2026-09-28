# 8. Use cases

[Course](README.md) · **English** · [Українською](uk/08-use-cases.md)

Four sessions, using the captures from this repository and from `examples/shop`. Each one says what to run, what the picture shows, and the decision it supports. The last section is when not to bother.

The UI captures are `keylang web` on 2026-09-28. Trace and test artifacts under `.keylang/` were stale. The CLI summary of that same tree was `0 fail, 22 unverified, 43 ok`.

## 1. A renamed module

Someone copies the slide and writes `order domain.aggregate` under `application.purchase`. The module in the map is `orderAggregate`.

```sh
node bin/keylang.js check examples/shop
```

![K001 dangling reference domain.aggregate](images/cli-shop-k001.png)

The first line is the decision: this is a typo or a stale name, and it fails the process. The parenthetical is the nearest id. The second line is a different fact. The example ships no TypeScript, so the checkout flow cannot be proved. You fix the id (see `examples/shop-fixed`) or, if the module really does not exist yet, you declare `planned` and accept `unverified` until the code arrives.

```sh
node bin/keylang.js explain K001
```

![What K001 means](images/cli-explain-k001.png)

Use this whenever a code is new. The UI shows the same paragraph for the diagnostic under the cursor when you press `?`.

After the fix the process exits 0 and the flow is still not proved:

![Exit 0, one unverified, because there is no snapshot](images/cli-shop-fixed.png)

Do not read that as "the shop architecture is verified". Read it as "the ids that can be resolved do resolve, and there is no code to check the rules against".

## 2. A layer rule you want CI to keep

This repository's rule is that the parser and the checker do not import the tree-sitter extractor, and they do not import `web-tree-sitter` directly either. The TUI is in the same position: it asks the analysis for facts and does not parse source itself.

![Rules file with a green gutter](images/tui-rules.png)

What to look at:

- The gutter on lines 14–31 is `✓`. Every criterion on those lines held for this snapshot.
- The colors follow the layer order in `keylang.json`. `base` and `lang` are not the same color as `extract` or `external`.
- The navigation tree on the right is the snapshot, not a hand-drawn outline. `cli` is expanded far enough to show `keylang`, `index`, the LSP and MCP entry points, the test reporter and the trace hooks.
- The status line is `✗ 0  ◌ 22  ✓ 11`. Zero failing lines. Twenty-two lines whose worst mark is unverified (the stale traces and tests in the flows). Eleven lines fully ok, which are these rules.

In CI you run both:

```sh
node bin/keylang.js check
node bin/keylang.js map --check
```

`check` fails if a new import crosses a `deny`. `map --check` fails if someone changed the code and did not regenerate `keylang/map/`. Neither command writes files. A pull request that adds `import web-tree-sitter` from `src/parser.ts` fails `check` with K102 pointed at that import, and the rules file stays the explanation.

`draft rules` can suggest a starting `layers` line from whatever the code does today. Treat that suggestion as a description of the present, and edit it into the rule you want before you merge it. A rule that only restates today's imports will not catch tomorrow's.

## 3. A flow that is partly proved

Open `keylang/flows/check.md` and put the cursor on the trigger.

![Trigger line with ID ok and trace unverified](images/tui-flow.png)

The expanded strip under line 16 is the whole idea of a flow:

| Mark | Reading |
|---|---|
| `ID ✓` | `cli.cli.main` is in the fresh snapshot |
| `static —` | Not reported. A trigger has no parent call to prove |
| `tests —` | Not reported on this line. The tests are attached to the invariants further down |
| `trace ◌` | Reported, and the trace file belongs to another snapshot |

The yellow line at the bottom names the file `.keylang/trace/check.jsonl` and the old snapshot id. The `✓` you might have wanted for the whole scenario is withheld because the trace, which this project configured, is not current. That is the useful outcome. A single green badge would have hidden it.

`K` shows the same split without making you read the strip:

![Hover: id ok, trace unverified, two spec references](images/tui-hover.png)

The box is the signature, `src/cli.ts:114`, the two evidence lines, the flow name, and the start of the function. "referenced 2 time(s) in specs" is the other flow or rule lines that name this id.

`Enter` opens the function. In the browser, and in a terminal with no `$EDITOR`, the viewer is inside keylang:

![main at src/cli.ts:114](images/tui-code.png)

The title stays on the spec you came from. The corner says `read-only` and `Esc` goes back. This is a navigation aid. It does not edit the TypeScript.

To make the trace `ok` you run the suite so the reporter and the trace adapter rewrite `.keylang/` for the current `snapshotId`, then `check` again. Until the hashes match, the honest mark is `◌`. If your pipeline must refuse that state, pass `--strict`. If you have not adopted traces, delete `check.trace` from `keylang.json` and the kind stops being reported.

The same shape in the CLI, with the middle of the report cut:

![CLI: ID ok, static ok, trace unverified, then the summary](images/cli-check-repo.png)

`static ok` on `cli.cli.run` is the call from `main`. Further down, `generateMap` is reached through the default of the hook `generate`, which `--static=behavior` counts and `--static=shape` would not. The summary `0 fail, 22 unverified, 43 ok` matches the UI once you remember the UI counts lines and the CLI counts results.

`explain` is the offline version of the hover, for a shell or a review comment:

![explain cli.cli.cmdCheck](images/cli-explain-id.png)

## 4. Reading the repository before editing it

A first session on an unfamiliar checkout:

1. `keylang web` and open the printed URL, or run `keylang` in the terminal.
2. `:` and type part of a path. The palette fuzzy-matches `open <file>`:

   ![Palette filtered with "rules"](images/tui-palette.png)

3. `F2` when you want the list instead of the palette. Specs are above the generated map:

   ![File list, rules and flows above the map](images/tui-files.png)

4. On a generated map, follow a link or press `Enter` on a function. The file is marked `generated, read-only`. Change the source, then `keylang map`. Do not hand-edit the Markdown: the next `map` will overwrite it, and a file that lost its marker blocks the whole write.

   ![lang layer map](images/tui-map.png)

5. `v` when you want to read the prose as a document. The gutter remains, so a rule you are reading is still checked:

   ![Reading mode](images/tui-read.png)

6. `?` when you forget a key. The overlay is per mode. On a line with an error it also includes the `explain` text:

   ![Help](images/tui-help.png)

From there the edits are ordinary. `i` to change a rule, `Ctrl+S` to write it, `F5` if you want an analysis immediately rather than waiting for the debounce. An agent that should help drafts into `.keylang/proposals/` via `draft`, `code-to-spec`, or MCP `apply_diff`. You merge with `m`. The spec does not change on the agent's write.

## When to leave it alone

keylang earns its keep when a repository has layers people already argue about, and you want that argument to fail a pull request. It is a poor fit when:

- The codebase is one layer, or the boundaries move every week and nobody will update ids.
- The bugs you care about are behavioral, numerical, or security issues that never show up as an import or a call between modules.
- You need a language the frontends do not parse. An unindexed file is a hole, and a project made entirely of holes will report `unverified` forever.
- You want the prose in the spec to be checked against the code. That check is not implemented. The bullets are what `check` reads.
- You want a runtime dependency injector for Rust, or request-scoped lifetimes. `keylang wire` emits one TypeScript composition root.

A small adoption that still pays off is `keylang.json` plus a short `rules.md` with `layers` and two or three `deny` lines, `check` and `map --check` in CI, and no flows until a scenario is worth a trace. Flows are worth it when you already have an end-to-end test and you want the test's name tied to the functions it is supposed to reach.
