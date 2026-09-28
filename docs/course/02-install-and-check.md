# 2. Install, check, explain

[Course](README.md) · **English** · [Українською](uk/02-install-and-check.md)

You need Node.js ≥ 22.18. The package does not compile native addons. Optional voice modules (`@fugood/whisper.node`, `decibri`) install when the platform has a prebuilt binary and can be omitted.

```sh
npx keylang init .     # guess layers, write keylang.json, generate the map
npx keylang check      # resolve ids and evaluate rules under keylang/
npm i -g keylang       # afterwards: keylang check
```

In this checkout the entry point is `node bin/keylang.js`, which loads TypeScript directly. An install from npm loads `dist/`. `npm link` gives you the `keylang` command while you work on the tool.

`init` writes `keylang.json` and a map. Layer names are one id segment. Names the tool reserves (`external`, `unassigned`, and the map keywords `layer`, `allow`, `deny`, `entry`, `module`, `no-cycles`) are renamed with a trailing `_`, and `init` says so on stderr. Without `keylang.json`, later commands guess layers from the directory tree.

## The commands you use first

| Command | Writes files? | What you read |
|---|---|---|
| `keylang check [paths…]` | No | Findings on stdout, `N fail, M unverified, K ok` on stderr |
| `keylang map [dir]` | `keylang/map/*.md` and `.keylang/index.json` | The generated map. Refuses to overwrite a map file that has no `keylang:generated` marker |
| `keylang map --check` | No | Exit 1 when the committed map does not match a fresh render, or when a map file lacks the marker |
| `keylang explain K001` | No | Why the code exists, a short example, and a fix |
| `keylang explain <id>` | No | Kind, signature, file, calls, callers, flows and rules that name the id |
| `keylang explain <id> --llm` | `.keylang/explain/<id>.md` | A prose explanation from the configured agent. Does not change any verdict |
| `keylang fmt <file>` | The file, in canonical form | Exit 1 when the file had diagnostics or, with `--check`, when it was not canonical |
| `keylang parse <file>` | No | A text dump of the IR. `--json` is machine-readable and is the only thing on stdout |
| `keylang doctor` | No | Languages, whether an agent key is configured, voice engine. Exit 0 even when it reports a problem |

`check` defaults to the spec directory in `keylang.json`, usually `keylang/`. You can pass files or directories. Passing `examples/shop` checks that tree even though it is not the project's spec directory.

Exit codes, for every command that follows them:

| Code | Meaning |
|---|---|
| 0 | No blocking finding |
| 1 | A violation, a stale map under `--check`, or any `unverified` when you passed `--strict` |
| 2 | Bad arguments, unknown command, or an I/O error. The message names the file and, for config, the field |

`--format` does not change the exit code. `human` is the default. `json`, `sarif` and `github` are for CI. `json` is a single object on stdout (`snapshotId`, `results`, `coverage`).

## A violation, then a clean id

`examples/shop` is the slide text with one deliberate mistake: the purchase module depends on `domain.aggregate`, and the module that exists is `domain.orderAggregate`.

![K001 on examples/shop, exit 1](images/cli-shop-k001.png)

Read it as three separate facts:

1. `K001` is an error. The reference does not resolve in a fully indexed module. The hint is the nearest declared id. Exit code 1.
2. The second line is `unverified`, not another error. The flow's rules and steps need a code snapshot, and this example has no source files. `no snapshot` means "not proved".
3. The summary counts both. One failure is enough to fail the process. The unverified line would not, unless you pass `--strict`.

`keylang explain K001` is the same text the UI shows for that code:

![explain K001](images/cli-explain-k001.png)

The fix in the example is the spelling. `examples/shop-fixed` uses `domain.orderAggregate`. There is still no code, so the flow stays unverified, and the process exits 0:

![shop-fixed exits 0](images/cli-shop-fixed.png)

That exit code is the point of the three-valued result. "No violation" and "every claim proved" are different. Use `--strict` in a pipeline that must refuse a gap. Use the default when a fresh clone has not produced test reports yet and you only want structural failures to go red.

If the id is a real intention and the code is not written, declare it instead of pointing at a typo:

```markdown
- planned fn domain.orderAggregate.create (items: Item[]) → Order
```

A reference to a `planned` id is not K001. Its `ID` evidence is `unverified` with reason `planned`. When the symbol later appears with the same kind and signature, the declaration becomes warning K202 (remove it). A different kind or signature is error K201.

## This repository

`keylang check` at the root rebuilds the snapshot, resolves every flow id against it, and evaluates `keylang/rules.md`. It does not write the map. The run that produced the screenshots printed no failures. The middle of the report is omitted in the picture; the summary line is the real stderr line:

![check on this repository, middle omitted](images/cli-check-repo.png)

`ID ok` means the symbol is in the fresh snapshot. `static ok` means a resolved call path from the parent, here "called from `cli.cli.main`". `trace unverified` names the file and the snapshot id the trace was built from. The ids differ, so the trace does not count. Run `npm test` to regenerate `.keylang/reports/` and `.keylang/trace/` for the current tree. Until then `--strict` exits 1 and a normal `check` exits 0.

`explain` on an id is offline and does not need an agent:

![explain cli.cli.cmdCheck](images/cli-explain-id.png)

`internal` on the second line means the function is not part of the module's public export list. `not resolved` counts constructs the frontend saw and did not turn into an edge. `closure … (incomplete)` means the transitive call fingerprint is not a closed proof of behavior, because something reachable is dynamic or unresolved.

## Formatting and parsing

`keylang fmt` re-renders a file from the IR. Bullets become `-`, tokens are separated by one space, commas are canonical (`a, b`), descriptions sit directly under their node, and the file ends with one newline. Running it twice changes nothing. A file with a structural error (odd indent, a tab in a list indent, an empty item) is left alone and reported as K003: a formatter that guessed the tree would change meaning.

`keylang parse --json file.md` is the IR for tools. Diagnostics go to stderr, so a pipe of stdout stays valid JSON.

## Config you will actually open

`keylang.json` at the repository root is the root marker. The fields you set by hand:

| Field | Role |
|---|---|
| `languages` | Subset of `javascript`, `typescript`, `python`, `rust`. Omitted: detected from extensions |
| `module` | `file` (default when languages disagree) or `dir` |
| `layers` | Layer name → glob list. Order in the file is the order of layer colors and of the navigation tree |
| `exclude` | Globs that stay out of the snapshot as opaque modules |
| `dir` | Spec directory, default `keylang` |
| `check.tests` | Path or glob of a keylang JSON report or JUnit XML |
| `check.trace` | Path or glob of trace JSONL |
| `agent` | Optional. `anthropic:<model>` or `openrouter:<model>`, used by `explain --llm` and drafts |

`check.tests` and `check.trace` are how a flow learns about a run. Without them, those evidence kinds are not printed and do not affect `--strict`. This repository sets both to globs under `.keylang/`, which is gitignored. CI that wants trace evidence has to produce the files in the job.

Next: [the language itself](03-the-language.md).
