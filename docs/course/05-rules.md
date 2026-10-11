# 5. Rules

[Course](README.md) · **English** · [Українською](uk/05-rules.md)

The map tells you what the code is. Rules say what it is allowed to be: they are the promise you make about the architecture. You write them; the agent writes the functions they talk about and does not change the rules. Rules live in `keylang/rules.md`, or in any file whose heading is `# rules`. They refer to ids from the snapshot but declare no modules, because that is the map's job.

This repository checks itself. The gutter, the column of marks next to each spec line, is green because every criterion on those lines held:

![keylang/rules.md in the UI](images/tui-rules.png)

To open the file, press `:`, type `rules` and press Enter; in the clip below, the cursor then walks down to the denies. The clip was recorded on a later run, after `npm test`, which is why the status line is all green:

![Opening the rules and walking down](images/tui-rules.gif)

The prose at the top of the file is for people; the bullets are the claims keylang checks. Here they say that the layers run `base < extract < lang < check < map < features < operations < tui < cli`. The language core (`lang` and `base`) and the checker depend on neither the map, the extractor nor `web-tree-sitter`. The TUI does not depend on the extractor either. A fixed set of modules are the entries, and the import graph has no cycles.

The sections below go through each kind of rule in that file.

## `layers`

```markdown
- layers domain < application < presentation
  - infrastructure
```

The layer on the left is lower. A need, meaning one module depending on another, may only point down. Presentation may import application, and application may import domain; domain importing application breaks the order, and keylang reports it as K101.

The layers nested under the bullet, together with `external` and `unassigned`, sit outside this up/down line. A need *into* them is free unless a `deny` forbids it. A need *out* of them into an ordered layer needs an `allow`; without one it is K101.

Several `layers` lines form one order: `a < b` and `b < c` together forbid `a` → `c`, while `a < b` and `c < d` say nothing about how `a` and `d` relate. A line that contradicts an earlier line, repeats a layer or uses an id with a dot is K005, and keylang does not check it.

Each line gets its own answer:

- `ok` when no need breaks the order and the area has no hole, that is, no call or import keylang could not resolve;
- `unverified` when there is a hole, because the missing edge might be exactly the one that breaks the order;
- `fail` (K101) when a resolved edge points the wrong way; the message points at the source line of that edge.

## `allow` and `deny`

```markdown
- allow infrastructure presentation
- deny domain infrastructure
- deny lang external.web-tree-sitter
```

`layers` sets the general direction; `allow` and `deny` handle the exceptions. Both take a source and one or more targets. The ids can be layers, modules (a class counts as the module of its file) or prefixes. The id of a function, type, event or dependency nickname is K005: rule edges run between modules, so such a rule would check nothing.

When two rules overlap and one is narrower on both sides, the narrower one wins. Narrowness is depth, the number of segments in the id, not the length of the string.

Sometimes neither rule is narrower on both sides. In the shop example, `deny app.x domain` (2 + 1) is narrower on the source and `allow app domain.storefront` (1 + 2) on the target. Their sums are equal, so `deny` wins, and there is no K106.

`allow app.x.y domain` (3 + 1) and `deny app domain.storefront` (1 + 2) cannot be compared either, but here the sums differ. In format 1 the greater sum lets the allow win, and keylang warns with K106 until a rule names the intersection `app.x.y domain.storefront`. In format 2 the deny wins instead, and K106 still warns. Without `format` you are on format 1, but with no `keylang.json` at all you are on format 2.

`allow` also suppresses K101 for its pair. That is how `infrastructure → presentation` stays legal in the shop.

One module-to-module need produces a single K102, however many edges show it. The message names the edge and the `deny` line it breaks.

A `deny` is `fail` when keylang resolved a forbidden edge, `unverified` when the area has a hole but no forbidden edge, and `ok` when keylang read the whole area and the edge is absent. A green `deny` is a claim about the edges keylang recorded. It does not prove that no function performs I/O through a channel the frontend cannot see.

## `entry`, `exports`, `no-cycles`

```markdown
- entry
  - infrastructure.server
  - presentation.terminal
- module application.purchase
  - exports buy, cancel
  - no-cycles
```

The direction rules say which way code may depend. These three say where the program starts, what a module offers and whether the graph loops.

`entry` lists the places where the program may start. Reachability follows import, call, type and re-export edges, and a module in an ordered layer that no entry reaches gets warning K103. If a reachable module has a hole, the warning becomes `unverified` instead, because the missing edge might have been the path. An entry that names a missing module is K001, so a worker you listed and later deleted stays visible instead of silently dropping out. K103 does not fail the process.

`exports` compares the names you listed with the module's public exports. `export { a as b }` counts as `b`, and `export default` counts as `default`. A public export you did not list is K104, and so is a listed name the module does not export. If an `export *` comes from an opaque module, one whose contents the snapshot does not know, the rule is `unverified` rather than claiming you forgot a name.

`no-cycles` looks for loops in the import and re-export graph. At the top level it covers the whole graph; under `module <id>` it covers that module, its submodules and the modules reachable from them. A cycle is K105, and a file that imports itself counts as one. A hole with no known cycle gives `unverified`, not `ok`, because the hole might hide one.

## How to read a result

| Answer | Meaning |
|---|---|
| `ok` | The claim held, and the area was fully covered |
| `fail` | A violation was found and shown |
| `unverified` | No violation was shown, but the snapshot is not complete enough to pass the claim |
| warning | K006, K008, K103, K106, K202, K203. Recorded, but not a failing verdict |

When a result concerns an edge, `check` points at the code; when it concerns a bad line, it points at the spec. `--explain-edge <a> <b>` prints the edges between two ids, or the unresolved constructs that could have formed one, and writes nothing.

In the UI, `✓` means every criterion on that line is `ok`. A line that is `ok` in structure but `unverified` in coverage shows `◌`. The status line counts lines, while `check` counts every single result. A flow step reports `ID`, `static`, `tests` and `trace` as separate results, so one line can give several. That is why `check` prints more `ok` results than the UI shows passing lines.

## A practical order

Knowing each rule is one thing; here is the order in which to adopt them on a real project.

1. `keylang init` writes the config, the map and the baseline, a set of generated rules. Right after `init` the baseline adds no new `fail`. A later import across a gap between layers, though, is K102 until you add an `allow` or run `keylang baseline` again.
2. `keylang draft rules` proposes a `layers` line based on today's edges. It writes a proposal, not the spec. Review it with care: a proposal that only restates today's accidents makes a weak rule.
3. Add the `deny` lines you actually mean to the hand-written `rules.md`. A few denies between layers beat a deny for every pair of files.
4. List the real processes as `entry`: the CLI, the server, workers, and the test hooks you intend to keep.
5. Put `keylang check`, `keylang map --check` and `keylang baseline --check` in CI. Add `--strict` only once you have fixed or accepted the unverified lines.

An agent does not edit either rules file in place. Any change it makes to the hand-written file is a proposal for you to review. The baseline carries the generated marker, so the editor and `apply_diff` refuse to change it; only `keylang baseline` rewrites it from the graph.

A rule can also be switched off without touching it, by changing what the rules see. `check --changed` guards against that. It compares the spec with the base (`HEAD`, or `--since <ref>` in a pull request) and reports K108 when:

- a `deny`, a rule line or a flow step disappeared;
- a new `allow` appeared;
- a rule line moved out of `rules.md`;
- `keylang.json` took files away from a rule through `exclude`, `assume` or `outside`.

A plain `check` does not read git and gives no K108. Only a person accepts such a change, with `check --changed --accept-weakening` and a commit.

Next: [flows](06-flows.md).
