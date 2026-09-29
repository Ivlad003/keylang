# 5. Rules

[Course](README.md) · **English** · [Українською](uk/05-rules.md)

Rules are the promise. They live in `keylang/rules.md`, or any file whose heading is `# rules`. They name ids from the snapshot. They do not declare the modules. The map does that.

This repository checks itself. The gutter is green because every criterion on those lines held:

![keylang/rules.md in the UI](images/tui-rules.png)

`:`, then `rules`, then Enter. The cursor walks down to the denies. This clip is from a later run, after `npm test`, so the status line is all green:

![Opening the rules and walking down](images/tui-rules.gif)

The prose at the top is for the reader. The bullets are the claims. Here they say: the layers run `base < extract < lang < check < map < features < tui < cli`. The language core does not depend on the map, the extractor, or `web-tree-sitter`. Neither does the checker. The TUI does not depend on the extractor either. A fixed set of modules are the entries. The import graph has no cycles.

## `layers`

```markdown
- layers domain < application < presentation
  - infrastructure
```

The left side is lower. A need may point down. Presentation may import application. Application may import domain. Domain importing application is K101.

Layers nested under the bullet, plus `external` and `unassigned`, are not in the up/down line. A need *into* them is free unless `deny` forbids it. A need *out* of them into an ordered layer needs `allow`, or it is K101.

Several `layers` lines are one order. `a < b` and `b < c` together forbid `a` → `c`. `a < b` and `c < d` say nothing about `a` and `d`. A line that contradicts an earlier line, repeats a layer, or uses an id with a dot is K005 and is not checked.

Each line has its own answer. `ok` when no need breaks the order and the area has no hole. `unverified` when there is a hole. `fail` (K101) when a resolved edge points the wrong way. The message points at the source line of the edge.

## `allow` and `deny`

```markdown
- allow infrastructure presentation
- deny domain infrastructure
- deny lang external.web-tree-sitter
```

Both take a source and one or more targets. The ids are layers, modules (a class counts as its file's module), or prefixes. An id of a function, type, event or dependency nickname is K005. Rule edges are between modules. Such a rule would check nothing.

When two rules can be compared, the narrower one wins. Depth is the number of segments, not the length of the string.

In the shop, `deny app.x domain` (2 + 1) and `allow app domain.storefront` (1 + 2) cannot be compared: one is narrower on the source, the other on the target. The sums are equal, so `deny` wins, and there is no K106.

`allow app.x.y domain` (3 + 1) and `deny app domain.storefront` (1 + 2) also cannot be compared. In format 1 the greater sum lets the allow win, and keylang warns with K106 until a rule names the intersection `app.x.y domain.storefront`. Format 2 lets that deny win, and K106 still warns. Omit `format` and you are on format 1. No `keylang.json` at all is format 2.

`allow` also suppresses K101 for its pair. That is how `infrastructure → presentation` stays legal in the shop.

One module-to-module need produces one K102, however many edges show it. The message names the edge and the `deny` line.

A `deny` is `fail` when a forbidden edge is resolved, `unverified` when the area has a hole and no forbidden edge, and `ok` when the area was fully read and the edge is absent. A green `deny` is a claim about edges keylang recorded. It is not a proof that no function performs I/O through a channel the frontend cannot see.

## `entry`, `exports`, `no-cycles`

```markdown
- entry
  - infrastructure.server
  - presentation.terminal
- module application.purchase
  - exports buy, cancel
  - no-cycles
```

`entry` lists where the program may start. Reachability follows import, call, type and re-export edges. A module in an ordered layer that no entry reaches is warning K103. A hole in a reachable module turns that into `unverified`, because the missing edge might have been the path. An entry that names a missing module is K001, so a deleted worker you listed stays visible. K103 does not fail the process.

`exports` compares the names you listed with the public exports of that module. `export { a as b }` is `b`. `export default` is `default`. An extra public export is K104. A listed name the module does not export is also K104. If `export *` comes from an opaque module, the rule is `unverified` rather than "you forgot a name."

`no-cycles` looks for loops in the import and re-export graph. At the top, the scope is the whole graph. Under `module <id>`, the scope is that module, its submodules, and modules reachable from them. A cycle is K105. A file that imports itself is a cycle. A hole with no known cycle is `unverified`, not `ok`.

## How to read a result

| Answer | Meaning |
|---|---|
| `ok` | The claim held, and the area was covered |
| `fail` | A violation was shown |
| `unverified` | No violation was shown, and the snapshot is not complete enough to pass the claim |
| warning | K006, K008, K103, K106, K202. Recorded. Not a failing verdict |

`check` points at the code for an edge and at the spec for a bad line. `--explain-edge <a> <b>` prints the edges between two ids, or the unresolved constructs that could have formed one. It writes nothing.

The UI's `✓` means every criterion on that line is `ok`. A line that is `ok` in structure and `unverified` in coverage shows `◌`. The status totals count lines. `check` counts every result. That is why the UI can show 11 passing lines while `check` prints 43 `ok` results.

## A practical order

1. `keylang init` writes the config, the map and the baseline. Right after `init` the baseline adds no new `fail`. A later import across the gap is K102 until you add an `allow` or run `keylang baseline` again.
2. `keylang draft rules` proposes a `layers` line from today's edges. It writes a proposal, not the spec. A proposal that only restates today's accidents is a weak rule.
3. Add the `deny` lines you mean, in the hand-written `rules.md`. Prefer a few layer denies over a deny per pair of files.
4. List real processes as `entry`: the CLI, the server, workers, test hooks you intend to keep.
5. Put `keylang check`, `keylang map --check` and `keylang baseline --check` in CI. Add `--strict` only after the unverified lines are fixed or accepted.

An agent does not edit either rules file in place. A change to the hand-written file is a proposal. The baseline carries the generated marker, so the editor and `apply_diff` refuse it. `keylang baseline` rewrites it from the graph.

Next: [flows](06-flows.md).
