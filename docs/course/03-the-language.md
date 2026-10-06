# 3. The language

[Course](README.md) · **English** · [Українською](uk/03-the-language.md)

A keylang file is an ordinary Markdown file with a small extra grammar on top. GitHub renders it as headings, lists and paragraphs, while the parser reads the same bytes under stricter rules. Once the file has been through `fmt`, what GitHub shows you and what `check` believes about it are the same thing.

This lesson gives you enough to write a map, a rules file and a flow. Together they are the spec: the part you write. The functions themselves are the agent's job, so you do not write them. The full keyword table lives in [`docs/format.md`](../format.md).

## Lines

The parser looks at each line and tries these cases in order, taking the first one that fits:

| If the line is… | It becomes |
|---|---|
| Inside a code fence | A code block, kept as written |
| Empty | The end of a paragraph, but not of a list |
| The first non-empty line, an HTML comment with `keylang:generated` | The "do not edit" mark |
| Column 0, `#`, then a space or the end | A section heading |
| A fence (` ``` ` or `~~~`) at indent under 4, or at any indent under an open list | A code block, and it closes the list |
| A `-`, `*` or `+` after the indent | A node |
| Indented at least two spaces under an open node | That node's description |
| Anything else | Prose, and it closes the list |

`##` headings, tables, quotes and numbered lists all count as prose. `fmt` keeps them where they are, but they declare nothing, so you can use them freely to explain things to a human reader.

A heading is `#`, a space and a kind, and for a flow it is followed by the flow's name:

```markdown
# map
# rules
# flow checkout
# wiring
```

An unknown heading such as `# Shop` gives warning K006, and the section under it is read as a map. Extra words after `# rules` or `# map` are K005, and so is `# flow` without a name. Two flows with the same name are K002.

## Indent and ids

Nesting depth is the indent divided by 2, and the indent must be made of spaces. A child sits exactly one level deeper than its parent. An odd indent, a jump of more than one level, a tab or an empty item is K003, and `fmt` refuses to format such a file.

An id is a sequence of segments joined by `.`. A segment starts with a letter, `_` or `$`, followed by letters, marks, digits, `_`, `$` or `-`. That makes `http-retry` and `$save` both legal, and they are two different ids. Ids in specs are always absolute, as in `application.purchase.buy`. The one exception is an `exports` list: the names there are the module's public export names, not map ids.

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

Each link points at a line of source code. `keylang map` writes these links for you, so you will rarely type them by hand. In a flow you may also write a link, such as `step [buy](../map/application.md#application.purchase.buy)`; the check only uses the id inside the brackets.

Names are resolved across every `*.md` file you checked, skipping hidden directories, `node_modules` and `target`. An exact id match wins; otherwise the longest declared prefix is used. What happens next depends on the module that prefix names. If its members were fully read, an unknown member is K001. If the module is opaque, meaning its contents are unknown, the member is `unverified`. A layer is never opaque, which is why `domain.aggregate` in the shop is K001 and not "maybe inside some unknown module."

## The word depends on the parent

The first word on a line is treated as a keyword only where its position allows that keyword. Anywhere else it is an ordinary name, or K004 if a keyword was required there.

| Where | You can write | With no keyword |
|---|---|---|
| Top of a map | `layer`, `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | A bare name is a layer, so the slides still parse |
| Top of rules | `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | K004, because rules do not declare layers |
| Top of a flow | `kind`, `trigger`, `step`, `reads`, `emits`, `calls`, `invariant`, `when`, `test`, `planned` | K004 |
| Top of wiring | `wire` | K004 |
| Under a layer | `module` | A bare name is a module |
| Under a map module | `module`, `fn`, `type`, `event` | `<alias> <id>`, a dependency |
| Under a function | `calls` | K004 |
| Under a flow step or trigger | `step`, `reads`, `emits`, `calls`, `when`, `test`, `invariant` | K004 |
| Under a rules `module <id>` | `exports`, `no-cycles` | K004 |

So `test` under a module is just a nickname for a dependency, because `test` is reserved only inside flows. The words `fn`, `type`, `event` and `module`, on the other hand, are keywords under a module, so you cannot use them as a dependency's name.

Spacing around commas does not matter: `a,b` and `a , b` both mean `a, b`. A trailing HTML comment is kept but ignored. A quote that is never closed is K005.

## The shop, written out

This is a shortened version of `examples/shop-fixed`. The real files also keep the prose from the slides.

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

The rules are a separate claim about the same code, so they do not declare the modules again:

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

Read `layers domain < application < presentation` as "domain is below application, which is below presentation." A dependency may only point down: `application` may use `domain`, but `domain` may not use `application` (that is K101). `infrastructure` is nested under the `layers` line, which puts it outside the order. Dependencies into it are allowed unless a `deny` says otherwise, but a dependency out of it into one of the ordered layers needs an `allow`. The `allow` line above is exactly that permission.

A description is indented text under a node, written without a bullet. `fmt` moves it so it sits directly under its node, and `check` does not interpret it at all: it is there for people.

The flow gives the scenario a name and spells out its steps. A step nested under another step is a call made inside that parent, while sibling steps read as "this, then that":

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

`kind` is either `business` or `technical`. `trigger` and `step` take exactly one id, while `reads` and `calls` take one or more. `emits` takes an event name; the optional word `event` in front of it is not checked against the map. `invariant` and `when` take free text. `then` is a reference when its only token is an id containing a dot, and plain text otherwise. `test` takes a path and, optionally, a test name in quotes.

`planned` declares an intention rather than a fact from the snapshot:

```markdown
- planned fn application.purchase.refund (id: OrderId) → Promise<void>
```

It can live at the top of a flow or in `keylang/features/<slug>.md`. A reference to a planned id is not K001, but the declaration adds no edge to the graph either. A package the code does not import yet is written as `planned module external.<pkg>`. Once the parent step's own module imports that package, the declaration becomes K202 (it can be removed) and the step is static `ok`. An import of the package from some other module does not make that step `ok`.

## Codes you hit while writing

| Code | Level | You wrote |
|---|---|---|
| K001 | error | An id that is not declared |
| K002 | error | The same id twice, or the same flow name twice |
| K003 | error | A bad indent, a tab, or an empty item. `fmt` stops |
| K004 | error | A keyword this position does not allow |
| K005 | error | A known keyword with wrong arguments |
| K006 | warning | A heading that is not `map`, `rules`, `flow` or `wiring` |

When a declared id is close to the one you wrote, K001 adds `did you mean …`, and when the id might be an intention it mentions `planned`. Warnings do not make `check` fail.

`keylang fmt --check` keeps a spec in canonical form in CI without writing anything. A wrong id does not stop formatting, but a bad indent does.

Next: [the map](04-map.md).
