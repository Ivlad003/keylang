# 3. The language

[Course](README.md) · **English** · [Українською](uk/03-the-language.md)

A keylang file is a Markdown file with a small extra grammar. GitHub shows it as headings, lists and paragraphs. The parser reads the same bytes with stricter rules, so what GitHub shows and what `check` believes stay aligned after `fmt`.

This lesson is enough to write a map, a rules file and a flow. The full keyword table is in [`docs/format.md`](../format.md).

## Lines

The parser looks at each line in this order:

| If the line is… | It becomes |
|---|---|
| Inside a code fence | A code block, kept as written |
| Empty | Ends a paragraph. It does not end a list |
| The first non-empty line, an HTML comment with `keylang:generated` | The "do not edit" mark |
| Column 0, `#`, then a space or the end | A section heading |
| A fence (` ``` ` or `~~~`) at indent under 4, or at any indent under an open list | A code block, and it closes the list |
| A `-`, `*` or `+` after the indent | A node |
| Indented at least two spaces under an open node | That node's description |
| Anything else | Prose, and it closes the list |

`##` headings, tables, quotes and numbered lists are prose. `fmt` keeps them. They declare nothing.

A heading is `#`, a space, a kind, and for a flow a name:

```markdown
# map
# rules
# flow checkout
# wiring
```

An unknown heading (`# Shop`) is warning K006, and the section is read as a map. Extra words on `# rules` or `# map` are K005. `# flow` without a name is K005. Two flows with the same name are K002.

## Indent and ids

Depth is the indent divided by 2. Use spaces. A child is exactly one level deeper than its parent. An odd indent, a jump of more than one level, a tab, or an empty item is K003. `fmt` refuses the file.

An id is segments joined by `.`. A segment starts with a letter, `_` or `$`, then letters, marks, digits, `_`, `$` or `-`. `http-retry` and `$save` are legal and different. Ids in specs are absolute (`application.purchase.buy`). Names in an `exports` list are the module's public export names, not map ids.

This map declares `domain.orderAggregate`, `domain.orderAggregate.create`, and the alias `application.purchase.order`:

```markdown
# map

- domain
  - module [orderAggregate](src/domain/order.ts#L1)
    - fn [create](src/domain/order.ts#L8) (items: Item[]) → Order
- application
  - module [purchase](src/app/purchase.ts#L1)
    - order domain.orderAggregate
```

The link points at a source line. `keylang map` writes these. You rarely write them by hand. In a flow you may write `step [buy](../map/application.md#application.purchase.buy)`. The check uses the id inside the brackets.

Names are resolved across every `*.md` you checked (hidden directories, `node_modules` and `target` are skipped). An exact id wins. Otherwise the longest declared prefix is used. If the module's members were fully read, an unknown member is K001. If the module is opaque, the member is `unverified`. A layer is never opaque, so `domain.aggregate` in the shop is K001, not "maybe inside an unknown module."

## The word depends on the parent

The first word is a keyword only where that position allows it. Anywhere else it is an ordinary name, or K004 if a keyword was required.

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

`test` under a module is a nickname for a dependency, because `test` is reserved only in flows. You cannot name a dependency `fn`, `type`, `event` or `module`.

`a,b` and `a , b` both mean `a, b`. A trailing HTML comment is kept and ignored. A quote that is not closed is K005.

## The shop, written out

This is `examples/shop-fixed`, shortened. The real files keep the slide prose.

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

The rules are a separate claim. They do not declare the modules again:

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

Read `layers domain < application < presentation` as "domain is below application is below presentation." A need may point down. `application` may use `domain`. `domain` may not use `application` (K101). `infrastructure` sits under the `layers` line, outside the order. Needs into it are free unless a `deny` says otherwise. Needs out of it into an ordered layer need an `allow`. The `allow` above is that permission.

A description is indented text under a node, with no bullet. `fmt` moves it to sit directly under the node. `check` does not interpret it.

The flow names the scenario. A step under a step is a call inside the parent. Sibling steps are "this, then that":

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

`kind` is `business` or `technical`. `trigger` and `step` take one id. `reads` and `calls` take one or more. `emits` takes an event name. The optional word `event` is not checked against the map. `invariant` and `when` are free text. `then` is a reference when its only token is an id with a dot, and text otherwise. `test` takes a path and an optional quoted name.

`planned` is an intention, not a fact in the snapshot:

```markdown
- planned fn application.purchase.refund (id: OrderId) → Promise<void>
```

It lives at the top of a flow, or in `keylang/features/<slug>.md`. A reference to it is not K001. It adds no edge. A package the code does not import yet is `planned module external.<pkg>`. When the parent step's own module imports that package, the declaration is K202 and the step is static `ok`. An import from a different module does not make that step `ok`.

## Codes you hit while writing

| Code | Level | You wrote |
|---|---|---|
| K001 | error | An id that is not declared |
| K002 | error | The same id twice, or the same flow name twice |
| K003 | error | Indent, a tab, or an empty item. `fmt` stops |
| K004 | error | A keyword this position does not allow |
| K005 | error | The keyword is known and the arguments are wrong |
| K006 | warning | A heading that is not `map`, `rules`, `flow` or `wiring` |

K001 includes `did you mean …` when a neighbor is close, and it mentions `planned` when the id might be an intention. Warnings do not fail `check`.

`keylang fmt --check` keeps a spec canonical in CI without writing it. A wrong id does not block formatting. A bad indent does.

Next: [the map](04-map.md).
