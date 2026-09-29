# 5. Rules

[Course](README.md) · **English** · [Українською](uk/05-rules.md)

Rules are the hand-written half of the architecture. They live in `keylang/rules.md` (or any file whose heading is `# rules`). They name ids from the snapshot. They do not declare the modules; the map does that.

This repository checks itself. The gutter is green because every reported criterion on those lines held, and the navigation tree is the layer list from `keylang.json`:

![keylang/rules.md in the UI](images/tui-rules.png)

The prose at the top is a description for the reader. The bullets are the claims. In this file they say: the pipeline of layers is `base < extract < lang < check < map < features < tui < cli`; the language core does not depend on the map, the extractor, or `web-tree-sitter`; neither does the checker; the TUI does not depend on the extractor either; a fixed set of modules are the entries (the CLI, the test reporter, the trace hooks, the analysis worker); and the import graph has no cycles.

## `layers`

```markdown
- layers domain < application < presentation
  - infrastructure
```

The left side is lower. A dependency may go downward: presentation may import application, application may import domain, presentation may import domain. Domain importing application is K101, a confirmed divergence.

Layers nested under the `layers` bullet, plus `external` and `unassigned`, are unordered. An edge into an unordered layer is free unless `deny` forbids it. An edge from an unordered layer into an ordered one needs `allow`, or it is K101.

Several `layers` lines form one partial order. `a < b` and `b < c` together forbid `a` → `c`. `a < b` and `c < d` say nothing about `a` and `d`. A line that contradicts an earlier line, repeats a layer, or uses an id with a dot is K005 and is not evaluated.

Each `layers` line has its own verdict. `ok` when no dependency breaks the order and the area has no dependency-level hole. `unverified` when there is a hole (unresolved import, a file that failed to parse, an excluded file, `eval`). `fail` (K101) when a resolved edge points the wrong way. The diagnostic points at the source line of the edge, and it names the rule.

## `allow` and `deny`

```markdown
- allow infrastructure presentation
- deny domain infrastructure
- deny lang external.web-tree-sitter
```

Both take a source and one or more targets. The ids are layers, modules (a class counts as its file's module), or prefixes of those. An id of a function, type, event or dependency alias is K005: rule edges are between modules, and such a rule would check nothing.

The most specific matching rule wins. Specificity is the sum of the two id depths in segments, not the string length. `deny app.x domain` (2 + 1) and `allow app domain.storefront` (1 + 2) tie, and a tie goes to `deny`. `allow app.x.y domain` (3 + 1) beats `deny app domain.storefront`. `allow` also suppresses K101 for its pair, which is how `infrastructure → presentation` stays legal in the shop example while the layer order would otherwise reject it.

One module-to-module dependency produces one K102, however many edges show it (import, call, type, re-export). The message names the edge and the `deny` line.

A `deny` is `fail` when a forbidden edge is resolved, `unverified` when the area has a dependency-level hole and no forbidden edge, and `ok` when the area was fully read and the edge is absent. An area with no module yet is `ok` ("no module … yet") unless the only declaration is `planned`, in which case it is `unverified`. A hole inside one function (an unknown decorator) changes what that function runs. It does not change what the module imports, so it is not a dependency-level hole and it does not by itself make `deny` unverified.

The shop's own comment is the right reading of a green `deny`: "the domain does not depend on infrastructure" is a claim about edges keylang recorded. It is not a proof that no function performs I/O through a channel the frontend cannot see.

## `entry`, `exports`, `no-cycles`

```markdown
- entry
  - infrastructure.server
  - presentation.terminal
- module application.purchase
  - exports buy, cancel
  - no-cycles
```

`entry` lists start modules. Reachability follows import, call, type and re-export edges, including a re-export through `index.ts` and a `new URL("./worker.ts", import.meta.url)` or `module.register` when the specifier is a string the resolver can see. A module in an ordered layer that no entry reaches is warning K103, pointed at the module's file. A dependency-level hole in a reachable module turns that "unreachable" into `unverified` instead of K103, because the missing edge might have been the path. Modules in unordered layers are not checked. An entry that names a missing module is K001, so a deleted worker you listed stays visible. `entry` with a layer or a prefix starts at every module under it.

K103 does not fail the process. It is a warning. The JSON format reports it as `warning`, not as `fail`.

`exports` compares the names you listed with the snapshot's public export table for that module, not with its submodules. `export { a as b }` is compared as `b`. `export default` is `default`. `export *` expands to the names of the other module, and if that module is opaque the rule is `unverified` rather than "you forgot a name". An extra public export is K104 (divergence). A listed name the module does not export is absence, also K104. Names in the list are export names, not map ids, so they do not produce K001.

`no-cycles` looks at the strongly connected components of the import / re-export graph. At the top level, as in this repository, the scope is the whole graph. Nested under `module <id>`, the scope is that module and its submodules. A cycle in scope is K105 and the message includes the path. A file that imports itself is a cycle. One K105 per component. A hole in the area with no known cycle is `unverified`, not `ok`.

## Reading a result

A rule result is one of:

| Verdict | Meaning |
|---|---|
| `ok` | The claim held, and the area was covered. The human format calls this convergence |
| `fail` | A violation was shown (divergence, or an absence the snapshot is complete enough to assert) |
| `unverified` | No violation was shown, and the snapshot is not complete enough to pass the claim |
| warning | K006, K103, K202. Recorded, not a failing verdict |

`check` points at the code for an edge finding and at the spec for a structural one. `--explain-edge <a> <b>` prints the snapshot edges between two ids, or the unresolved constructs that could have formed one, and writes nothing.

The UI's `✓` on a rule line means every criterion reported on that line is `ok`. A line that is `ok` in structure and `unverified` in coverage shows `◌`, not `✓`. The status totals count lines, not individual evidence rows. That is why this repository's UI can show 11 passing lines while `check` prints 43 `ok` results: many flow lines carry several results, and a stale trace downgrades the whole line.

## A practical order

1. `keylang init` writes `keylang.json`, the map and `keylang/rules.baseline.md`. You can also write `layers` in `keylang.json` so the groups match how you already talk about the code. The baseline denies each layer the layers it does not already depend on, and allows only the packages that layer already imports. Right after `init` it adds no new `fail`. A later import across that gap is K102 until you add an `allow` in `rules.md` or run `keylang baseline` again.
2. `keylang draft rules` proposes a `layers` line from the edges that exist today, plus `no-cycles` when the graph has none. It writes a proposal, not the spec. Read it. A proposal that only restates the current accidents of the code is a weak rule.
3. Add the `deny` lines you actually mean, in the hand-written `rules.md`. The baseline is the frame of today's graph. The lines you write are the decision. Prefer a few layer-level denies over a deny per pair of files.
4. List real processes as `entry`: CLI, server, workers, test hooks you intend to keep.
5. Put `keylang check`, `keylang map --check` and `keylang baseline --check` in CI. Add `--strict` only after the unverified lines are either fixed or accepted as out of scope.

An agent does not edit either rules file in place. Claude and Codex are denied Edit and Write of `rules.md` and `rules.baseline.md`. A change to the hand-written file is a proposal (`apply_diff`), which you merge. The baseline carries the generated marker, so the editor and `apply_diff` refuse it. `keylang baseline` rewrites it from the graph.

`draft rules --mode llm` asks the configured model for rules and then checks each proposed rule on its own. The comment on the line is `agree`, `conflict` or `llm-only`. `hybrid` appends the algorithmic rules the model left out. A conflict is printed with the K101 or K102 it would create. The model does not get the last word: `check` does, after you merge.

Next: [flows](06-flows.md), which attach a scenario to the same snapshot.
