# 3. The language

[Course](README.md) · **English** · [Українською](uk/03-the-language.md)

A keylang file is a Markdown file with a small extra grammar. GitHub shows it as headings, lists and paragraphs. The parser reads the same bytes with stricter rules, so what GitHub shows and what `check` believes stay aligned after `fmt`.

This lesson is enough to write the three file kinds. The exhaustive keyword table, the recovery rules and the snapshot schema are in [`docs/format.md`](../format.md) §§1–8 and §11.

## Lines

The parser classifies each line in order:

| If the line is… | It becomes |
|---|---|
| Inside a code fence | A code block, kept verbatim |
| Empty | Ends a prose paragraph. It does not end a list |
| The first non-empty line, an HTML comment containing `keylang:generated` | The generated-file marker |
| Column 0, `#`, then a space or the end | A section heading |
| A fence (` ``` ` or `~~~`) at any indent | A code block, and it closes the open list |
| A `-`, `*` or `+` after the indent | A node |
| Indented at least two spaces under an open node | That node's description |
| Anything else | Prose, and it closes the list |

`##` headings, tables, quotes and numbered lists are prose. They round-trip through `fmt`. They do not declare anything.

A heading is `#`, a space, a kind, and for a flow a name:

```markdown
# map
# rules
# flow checkout
# wiring
```

An unknown top-level heading (`# Shop`) is warning K006 and the section is treated as a map. Extra words on `# rules` or `# map` are K005. `# flow` without a name is K005. Two flows with the same name are K002. A flow name does not collide with a map id.

## Indent and ids

Depth is the indent divided by 2. Indents are spaces. A child is exactly one level deeper than its parent. An odd indent, a jump of more than one level, a tab in that indent, or an empty item is K003. `fmt` refuses the file.

An id is segments joined by `.`:

```text
segment := (letter | "_" | "$") (letter | mark | digit | "_" | "$" | "-")*
```

Letters are Unicode. `http-retry` and `$save` are legal and distinct. Ids in specs are absolute from the root (`application.purchase.buy`), except names in an `exports` list, which are public export names of that module.

A declaration's id is the path of ancestors: layer, module, then `fn`, `type`, `event`, or a dependency alias. So this map declares `domain.orderAggregate`, `domain.orderAggregate.create`, and the alias `application.purchase.order`:

```markdown
# map

- domain
  - module [orderAggregate](src/domain/order.ts#L1)
    - fn [create](src/domain/order.ts#L8) (items: Item[]) → Order
- application
  - module [purchase](src/app/purchase.ts#L1)
    - order domain.orderAggregate
```

The link is the binding to a source line. Generated maps compute it relative to the map file and encode characters that would break a Markdown link, including parentheses in a Next.js route group. You rarely write these links by hand: `keylang map` does.

Resolution is global across every `*.md` under the directory you checked (hidden directories, `node_modules` and `target` skipped). A exact declared id wins. Otherwise the longest declared prefix is used. With a snapshot, a module whose members are `complete` yields K001 for an unknown member, and a module whose members are `opaque` yields `unverified`. Without a snapshot, a module that lists no members is opaque, which is why the slide form `infrastructure.config.log` can be a legal alias target. A layer is never opaque, so `domain.aggregate` in the shop example is K001 rather than an unknown member of an opaque module.

## Keywords depend on the parent

The first word is a keyword only when that position allows it. Anywhere else it is an ordinary name, or a K004 if the position requires a keyword.

The positions you write constantly:

| Where | You can write | With no keyword |
|---|---|---|
| Top of a map | `layer`, `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | A bare name is a layer, so the slides still parse |
| Top of rules | `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | K004. Rules do not declare layers |
| Top of a flow | `kind`, `trigger`, `step`, `reads`, `emits`, `calls`, `invariant`, `when`, `test`, `planned` | K004 |
| Top of wiring | `wire` | K004 |
| Under a layer | `module` | A bare name is a module |
| Under a map module | `module`, `fn`, `type`, `event` | `<alias> <id>`, a dependency |
| Under a function | `calls` | K004 |
| Under a flow step or trigger | `step`, `reads`, `emits`, `calls`, `when`, `test`, `invariant` | K004 |
| Under a rules `module <id>` | `exports`, `no-cycles` | K004 |

`test` under a module is a dependency alias, because `test` is reserved only in flows. You cannot name a dependency `fn`, `type`, `event` or `module`. The generator suffixes a colliding alias (`type` becomes `type2`).

Commas are their own token. `a,b` and `a , b` mean `a, b`. A trailing HTML comment on the line is stored and ignored by the semantics. Quotes that are not closed are K005.

## A shop, written out

This is the shape of `examples/shop-fixed`, condensed. The real files keep the slide prose.

```markdown
# map

- domain
  - module orderAggregate
    - fn create (items: Item[]) → Order
    - fn total (order: Order) → Money
- infrastructure
  - module products
    - fn find (id: ProductId) → Promise<Product>
  - module orderStore
    - fn save (order: Order) → Promise<void>
- application
  - module purchase
    - order domain.orderAggregate
    - catalog infrastructure.products
    - orders infrastructure.orderStore
    - fn buy (cart: Cart) → Promise<Order>
      - calls infrastructure.products.find, domain.orderAggregate.create, infrastructure.orderStore.save
    - type OutOfStock extends Error
- presentation
  - module terminal
    - checkout application.purchase
```

The rules are a separate claim. They do not redeclare the modules:

```markdown
# rules

- layers domain < application < presentation
  - infrastructure
- allow infrastructure presentation
  The server is handed presentation.api, so infrastructure may see presentation.
- deny domain infrastructure
  The domain stays free of I/O. This line does not, by itself, prove that no I/O exists.
- entry
  - infrastructure.server
  - presentation.terminal
- module application.purchase
  - exports buy, cancel
  - no-cycles
```

`layers domain < application < presentation` reads as "domain is below application is below presentation". A dependency may point downward. `application` may use `domain`. `domain` may not use `application` (K101). `infrastructure` is nested under the `layers` line, so it is outside the order: edges into it are free unless a `deny` says otherwise, and edges out of it into an ordered layer need an `allow`. The `allow` above is that permission for `infrastructure` → `presentation`.

A description is the indented text under a node, with no bullet. `fmt` moves it to sit directly under the node. `check` does not interpret it.

The flow names the scenario. Steps under a step are nested calls. Sibling steps are a sequence:

```markdown
# flow checkout

Purchase from the terminal, through to a stored order.

- kind business
- trigger presentation.terminal.checkout
- step application.purchase.buy
  - reads infrastructure.products.find
  - step domain.orderAggregate.create
  - step infrastructure.orderStore.save
  - emits event order.created
- invariant total equals the sum of price times quantity
  - test tests/purchase.test.ts "computes total"
- when the item is out of stock
  - then application.purchase.OutOfStock
  - test tests/purchase.test.ts "rejects out of stock"
```

`kind` is `business` or `technical`. `trigger` and `step` take one id. `reads` and `calls` take one or more ids. `emits` takes an event name; the optional word `event` is not checked against the map. `invariant` and `when` take free text. `then` is a reference when its only token is an id that contains a dot, and free text otherwise. `test` takes a path and an optional quoted name.

`planned` is an intention, not a snapshot fact:

```markdown
- planned fn application.purchase.refund (id: OrderId) → Promise<void>
```

It lives at the top of a flow. References to it are not K001. It adds no edge.

## Diagnostics you hit while writing

| Code | Level | You wrote |
|---|---|---|
| K001 | error | An id that is not declared |
| K002 | error | The same id twice, or the same flow name twice. A layer may continue across files; almost nothing else may |
| K003 | error | Indent, a tab, or an empty item. `fmt` stops |
| K004 | error | A keyword this position does not allow |
| K005 | error | The keyword is known and the arguments are wrong, including a bad id, link or quote |
| K006 | warning | A heading that is not `map`, `rules`, `flow` or `wiring`. The check still passes |

K001 includes `did you mean …` when a neighbor is close, and it tells you about `planned` when the id might be an intention. Warnings do not fail `check`.

`keylang fmt --check` is the way to keep a spec canonical in CI without writing it. Semantic errors do not block formatting. Structural errors do.

Next: [how the map is generated](04-map.md), then [rules](05-rules.md) and [flows](06-flows.md) as checks rather than syntax.
