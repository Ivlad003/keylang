# 2. Install, check, explain

[Course](README.md) · **English** · [Українською](uk/02-install-and-check.md)

You write the spec. An agent generates the functions. You do not. keylang does not start the agent. The commands below check the result.

You need Node.js ≥ 22.18. The package does not compile native code. Optional voice modules (`@fugood/whisper.node`, `decibri`) install when the platform has a prebuilt binary. They can be omitted.

```sh
npx keylang init .     # layers, keylang.json, the map, a baseline, harness files
npx keylang check      # resolve ids and evaluate rules under keylang/
npm i -g keylang       # afterwards: keylang check
```

In this checkout the entry point is `node bin/keylang.js`. It loads TypeScript directly. An install from npm loads `dist/`.

`init` writes `keylang.json`, the map, and `keylang/rules.baseline.md`. The baseline denies each layer the layers it does not already depend on. A layer that already imports packages is allowed those packages and denied the rest of `external`. Right after `init` the baseline adds no new `fail`: it describes the graph it just saw. A later import across a gap is K102 until you change the rule or run `keylang baseline` again.

Unless you pass `--agents=none`, `init` also writes a managed block in `AGENTS.md` between `<!-- keylang:begin -->` and `<!-- keylang:end -->`. Text outside the markers is left as it was. If `.claude/`, `.codex/`, `.cursor/` or `opencode.json` is already there, the same run registers an MCP server named `keylang`, copies the `keylang-feature` skill, and, for Claude and Codex, a Stop hook. A skill directory that keylang itself created does not count as "Claude is installed," so a second `init` does not grow new adapters. `keylang agents` repeats that install on a repository that already has `keylang.json`. `--check` on `init`, `agents` or `baseline` writes nothing and exits 1 when the generated text is stale.

Layer names are one id segment. Reserved names (`external`, `unassigned`, and the map keywords `layer`, `allow`, `deny`, `entry`, `module`, `no-cycles`) are renamed with a trailing `_`. `init` says so on stderr. Without `keylang.json`, later commands guess layers from the directories.

## The commands you use first

| Command | Writes files? | What you read |
|---|---|---|
| `keylang check [paths…]` | No | Findings on stdout, `N fail, M unverified, K ok` on stderr. `--changed` keeps findings that touch files changed since `HEAD` (or `--since`), plus untracked files, including a deleted file a flow still names |
| `keylang baseline` | `keylang/rules.baseline.md` | The generated deny/allow frame. `--check` exits 1 and names `keylang baseline` when the file no longer matches |
| `keylang feature <slug>` | No | Whether `keylang/features/<slug>.md` is done. Exit 0 done, 1 gaps, 2 missing file |
| `keylang agents` | Harness files outside `keylang/` | The same adapters as `init`. `--agents=none` removes that install and leaves the baseline |
| `keylang map [dir]` | `keylang/map/*.md`, `.keylang/index.json`, and `keylang/map-explained/` when `explain.map` is on | Refuses to overwrite a map file with no `keylang:generated` marker |
| `keylang map --check` | No | Exit 1 when the committed map does not match a fresh render, or a map file lacks the marker |
| `keylang explain K001` | No | Why the code exists, a short example, and a fix |
| `keylang explain <id>` | No | Kind, signature, file, calls, callers, flows and rules, and `fresh` or `stale` for a saved explanation |
| `keylang explain <id> --llm` | `keylang/explain/<id>.md` | Prose from the configured agent. It does not change a verdict |
| `keylang fmt <file>` | The file | Exit 1 on a structural error, or with `--check` when the file was not canonical |
| `keylang parse <file>` | No | A text dump. `--json` is the only thing on stdout. Diagnostics go to stderr |
| `keylang doctor` | No | Languages, whether an agent key is set, voice. Exit 0 even when it reports a problem |

`check` defaults to the spec directory in `keylang.json`, usually `keylang/`. Passing `examples/shop` checks that tree.

| Code | Meaning |
|---|---|
| 0 | No blocking finding |
| 1 | A violation, a stale map, baseline or harness under `--check`, or any `unverified` when you passed `--strict` |
| 2 | Bad arguments, or an I/O error. The message names the file and, for config, the field |

`--format` does not change the exit code. `human` is the default. `json`, `sarif` and `github` are for CI.

## A wrong name, then a clean one

`examples/shop` has one deliberate mistake. The purchase module depends on `domain.aggregate`. The module that exists is `domain.orderAggregate`.

![K001 on examples/shop, exit 1](images/cli-shop-k001.png)

Read three separate facts:

1. `K001` is an error. The name does not resolve. The hint is the nearest id. Exit code 1.
2. The second line is `unverified`, not another error. This example has no source files, so the flow cannot be proved. `no snapshot` means "not proved."
3. One failure is enough to fail the process. The unverified line would not, unless you pass `--strict`.

![explain K001](images/cli-explain-k001.png)

`examples/shop-fixed` spells `domain.orderAggregate`. There is still no code, so the flow stays unverified, and the process exits 0:

![shop-fixed exits 0](images/cli-shop-fixed.png)

"No violation" and "every claim proved" are different. Use `--strict` when a gap must fail the pipeline. Use the default when a fresh clone has no test reports yet and you only want structural failures to go red.

If the name is a real intention and the code is not written, declare it:

```markdown
- planned fn domain.orderAggregate.create (items: Item[]) → Order
```

A reference to a `planned` id is not K001. Its `ID` evidence is `unverified` with reason `planned`. When the symbol later appears with the same kind and signature, the declaration becomes warning K202. A different kind or signature is error K201.

## This repository

`keylang check` at the root rebuilds the snapshot and evaluates `keylang/rules.md`. It does not write the map. The run in the picture printed no failures:

![check on this repository, middle omitted](images/cli-check-repo.png)

`ID ok` means the symbol is in the fresh snapshot. `static ok` means a call path from the parent, here "called from `cli.cli.main`." `trace unverified` means the trace file was built for a different snapshot. Run `npm test` to regenerate `.keylang/reports/` and `.keylang/trace/`. Until then `--strict` exits 1 and a normal `check` exits 0.

![explain cli.cli.cmdCheck](images/cli-explain-id.png)

`internal` means the function is not in the module's public exports. `closure … (incomplete)` means something reachable is dynamic or unresolved, so the fingerprint is not a closed proof of behavior.

## Formatting

`keylang fmt` rewrites a file from the parse. Bullets become `-`. Tokens get one space. The file ends with one newline. Running it twice changes nothing. A structural error (odd indent, a tab, an empty item) is left alone and reported as K003. A formatter that guessed the tree would change the meaning.

`keylang parse --json file.md` is the IR for tools. Diagnostics go to stderr, so a pipe of stdout stays valid JSON.

## The config you will open

`keylang.json` at the repository root is the root marker.

| Field | Role |
|---|---|
| `format` | Language edition. Omitted means edition 1. No `keylang.json` at all is read as the current edition, 2. Edition 2 lets an incomparable `deny` win |
| `languages` | Subset of `javascript`, `typescript`, `python`, `rust`. Omitted: detected from extensions |
| `module` | `file` (default when languages disagree) or `dir` |
| `layers` | Layer name → glob list. Key order is the order of colors and of the tree |
| `exclude` | Globs that stay in the snapshot as opaque modules |
| `dir` | Spec directory, default `keylang` |
| `check.tests` | A keylang JSON report or JUnit XML |
| `check.trace` | Trace JSONL |
| `check.static` | `behavior` (default) or `shape`. A flag beats the file |
| `agent` | Optional. `anthropic:<model>` or `openrouter:<model>` for `explain --llm` and drafts |
| `explain.map` | Optional. `true` also writes `keylang/map-explained/`. `check` does not read it |

Without `check.tests` and `check.trace`, those evidence kinds are not printed and do not affect `--strict`. This repository points both at `.keylang/`, which is gitignored. CI that wants trace evidence has to produce the files in the job.

Next: [the language](03-the-language.md).
