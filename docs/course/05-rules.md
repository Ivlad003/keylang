# 5. Rules

[Course](README.md) · **English** · [Українською](uk/05-rules.md)

Rules are the promise you make about the architecture. You write them, and the agent writes the functions they talk about; the rules themselves are not the agent's to change. Rules live in `keylang/rules.md`, or in any file whose heading is `# rules`. They refer to ids from the snapshot but do not declare modules themselves, because that is the map's job.

This repository checks itself. The gutter, the column of marks next to each spec line, is green here because every criterion on those lines held:

![keylang/rules.md in the UI](images/tui-rules.png)

To get there, press `:`, type `rules` and press Enter; the cursor then walks down to the denies. The clip comes from a later run, after `npm test`, which is why the status line is all green:

![Opening the rules and walking down](images/tui-rules.gif)

The prose at the top of the file is for the human reader, while the bullets are the claims that keylang checks. Here they say that the layers run `base < extract < lang < check < map < features < operations < tui < cli`. The language core (`lang` and `base`) does not depend on the map, the extractor or `web-tree-sitter`, and neither does the checker. The TUI does not depend on the extractor either. A fixed set of modules are the entries, and the import graph has no cycles.

## `layers`

```markdown
- layers domain < application < presentation
  - infrastructure
```

The layer on the left is lower, and a need, meaning one module depending on another, may only point down. So presentation may import application, and application may import domain, but domain importing application breaks the order and is reported as K101.

The layers nested under the bullet, together with `external` and `unassigned`, sit outside this up/down line. A need *into* them is free unless a `deny` forbids it. A need *out* of them into an ordered layer, however, needs an `allow`, otherwise it is K101.

Several `layers` lines form one order. For example, `a < b` and `b < c` together forbid `a` → `c`, while `a < b` and `c < d` say nothing about how `a` and `d` relate. A line that contradicts an earlier line, repeats a layer or uses an id with a dot is K005, and keylang does not check it.

Each line gets its own answer. It is `ok` when no need breaks the order and the area has no hole, that is, no call or import that keylang could not resolve. It is `unverified` when there is a hole, because the missing edge might be exactly the one that breaks the order. It is `fail` (K101) when a resolved edge points the wrong way, and the message then points at the source line of that edge.

## `allow` and `deny`

```markdown
- allow infrastructure presentation
- deny domain infrastructure
- deny lang external.web-tree-sitter
```

Both take a source and one or more targets. The ids can be layers, modules (a class counts as the module of its file) or prefixes. The id of a function, type, event or dependency nickname is K005: rule edges run between modules, so such a rule would check nothing.

When two rules can be compared, the narrower one wins. Narrowness is measured by depth, which is the number of segments in the id, not the length of the string.

In the shop example, `deny app.x domain` (2 + 1) and `allow app domain.storefront` (1 + 2) cannot be compared, because one is narrower on the source and the other on the target. Their sums are equal, so `deny` wins, and there is no K106.

`allow app.x.y domain` (3 + 1) and `deny app domain.storefront` (1 + 2) cannot be compared either. In format 1 the greater sum lets the allow win, and keylang warns with K106 until a rule names the intersection `app.x.y domain.storefront`. Format 2 lets that deny win instead, and K106 still warns. If you omit `format`, you are on format 1, but if there is no `keylang.json` at all, you are on format 2.

`allow` also suppresses K101 for its pair. That is how `infrastructure → presentation` stays legal in the shop.

One module-to-module need produces a single K102, however many edges show it, and the message names both the edge and the `deny` line it breaks.

A `deny` is `fail` when a forbidden edge is resolved, `unverified` when the area has a hole but no forbidden edge, and `ok` when the area was read completely and the edge is absent. Keep in mind that a green `deny` is a claim about the edges keylang recorded. It does not prove that no function performs I/O through a channel the frontend cannot see.

## `entry`, `exports`, `no-cycles`

```markdown
- entry
  - infrastructure.server
  - presentation.terminal
- module application.purchase
  - exports buy, cancel
  - no-cycles
```

`entry` lists the places where the program may start. Reachability follows import, call, type and re-export edges, and a module in an ordered layer that no entry reaches gets warning K103. If a reachable module has a hole, that warning becomes `unverified` instead, because the missing edge might have been the path. An entry that names a missing module is K001, so a worker you listed and later deleted stays visible rather than silently dropping out. K103 does not fail the process.

`exports` compares the names you listed with the public exports of that module. Here `export { a as b }` counts as `b`, and `export default` counts as `default`. A public export you did not list is K104, and so is a listed name the module does not export. If an `export *` comes from an opaque module, one whose contents the snapshot does not know, the rule is `unverified` rather than telling you that you forgot a name.

`no-cycles` looks for loops in the import and re-export graph. At the top level its scope is the whole graph; under `module <id>` the scope is that module, its submodules and the modules reachable from them. A cycle is K105, and a file that imports itself also counts as a cycle. A hole with no known cycle gives `unverified`, not `ok`, because the hole might hide one.

## How to read a result

| Answer | Meaning |
|---|---|
| `ok` | The claim held, and the area was fully covered |
| `fail` | A violation was found and shown |
| `unverified` | No violation was shown, but the snapshot is not complete enough to pass the claim |
| warning | K006, K008, K103, K106, K202. Recorded, but not a failing verdict |

For an edge, `check` points at the code; for a bad line, it points at the spec. `--explain-edge <a> <b>` prints the edges between two ids, or the unresolved constructs that could have formed one, and it writes nothing.

In the UI, `✓` means every criterion on that line is `ok`. A line that is `ok` in structure but `unverified` in coverage shows `◌`. The totals in the status line count lines, whereas `check` counts every single result. A flow step reports `ID`, `static`, `tests` and `trace` as separate results, so one line can give several, which is why `check` prints more `ok` results than the UI shows passing lines.

## A practical order

1. `keylang init` writes the config, the map and the baseline, a set of generated rules. Right after `init` the baseline adds no new `fail`, but a later import across a gap between layers is K102 until you add an `allow` or run `keylang baseline` again.
2. `keylang draft rules` proposes a `layers` line based on today's edges. It writes a proposal, not the spec itself. Treat it with care: a proposal that only restates today's accidents makes a weak rule.
3. Add the `deny` lines you actually mean to the hand-written `rules.md`. A few denies between layers are better than a deny for every pair of files.
4. List the real processes as `entry`: the CLI, the server, workers, and the test hooks you intend to keep.
5. Put `keylang check`, `keylang map --check` and `keylang baseline --check` in CI. Add `--strict` only once the unverified lines are fixed or accepted.

An agent does not edit either rules file in place. A change it makes to the hand-written file is a proposal that you review. The baseline carries the generated marker, so the editor and `apply_diff` refuse to change it, and only `keylang baseline` rewrites it from the graph.

Next: [flows](06-flows.md).
