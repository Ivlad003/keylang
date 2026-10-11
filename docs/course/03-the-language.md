# 3. The language

[Course](README.md) · **English** · [Українською](uk/03-the-language.md)

A keylang file is plain Markdown with a small grammar on top. GitHub renders it as headings, lists and paragraphs; the parser reads the same bytes under stricter rules. After `fmt`, what GitHub shows you and what `check` believes about the file agree.

This lesson teaches enough to write a map, a rules file and a flow. Together they make the spec, which is your part; the functions are the agent's job. The full keyword table lives in [`docs/grammar.md`](../grammar.md), §5.

## Lines

The parser reads one line at a time and takes the first case below that fits:

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

`##` headings, tables, quotes and numbered lists all count as prose. `fmt` keeps them where they are, but they declare nothing. Use them freely to explain things to people.

A heading is `#`, a space and a kind. A flow or a migration table also takes a name:

```markdown
# map
# rules
# flow checkout
# wiring
# migration shop-v2
```

An unknown heading such as `# Shop` gives warning K006, and the section under it is read as a map. Extra words after `# rules`, `# map` or `# wiring` are K005, and so is `# flow` or `# migration` without a name. Two flows with the same name are K002.

## Indent and ids

Nesting depth is the indent divided by 2, and the indent must be made of spaces. A child sits exactly one level deeper than its parent. An odd indent, a jump of more than one level, a tab or an empty item is K003, and `fmt` refuses to format such a file.

An id is a sequence of segments joined by `.`. A segment starts with a letter, `_` or `$`, followed by letters, marks, digits, `_`, `$` or `-`. That makes `http-retry` and `$save` both legal, and they are two different ids. Ids in specs are always absolute, as in `application.purchase.buy`. The one exception is an `exports` list, which holds the module's public export names, not map ids.

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

Each link points at a line of source code. `keylang map` writes these links, so you will rarely type one. In a flow you may also write a link, such as `step [buy](../map/application.md#application.purchase.buy)`; the check only uses the id inside the brackets.

keylang resolves names across every `*.md` file you checked, skipping hidden directories, `node_modules` and `target`. An exact id match wins; otherwise the longest declared prefix is used, and the module it names decides the outcome. If its members were fully read, an unknown member is K001. If the module is opaque, so its contents are unknown, the member is `unverified`. A layer is never opaque, which is why `domain.aggregate` in the shop is K001 and not "maybe inside some unknown module."

## The word depends on the parent

Once ids resolve, the next question is what each line means. The first word on a line is a keyword only where its position allows that keyword. Anywhere else it is an ordinary name, or K004 if a keyword was required there.

| Where | You can write | With no keyword |
|---|---|---|
| Top of a map | `layer`, `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | A bare name is a layer, so the slides still parse |
| Top of rules | `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | K004, because rules do not declare layers |
| Top of a flow | `kind`, `trigger`, `continues`, `step`, `parallel`, `reads`, `emits`, `calls`, `invariant`, `when`, `after`, `every`, `test`, `planned`, `?` | K004 |
| Top of wiring | `wire` | K004 |
| Top of migration | `map`, `dropped` | K004 |
| Under a layer | `module` | A bare name is a module |
| Under a map module | `module`, `fn`, `type`, `event` | `<alias> <id>`, a dependency |
| Under a function | `calls` | K004 |
| Under a flow step or trigger | `step`, `parallel`, `reads`, `emits`, `calls`, `when`, `after`, `every`, `test`, `invariant`, `?` | K004 |
| Under `when` in a flow | `then`, `step`, `parallel`, `test`, `?` | K004 |
| Under `parallel` | `step` | K004 |
| Under a rules `module <id>` | `exports`, `no-cycles` | K004 |

So `test` under a module is just a nickname for a dependency, because `test` is reserved only inside flows. The words `fn`, `type`, `event` and `module` are keywords under a module, so they can't name a dependency.

Spacing around commas does not matter: `a,b` and `a , b` both mean `a, b`. A trailing HTML comment is kept but ignored. A quote that is never closed is K005.

## The shop, written out

Here is all of that put together, a shortened `examples/shop-fixed`. The real files also keep the prose from the slides.

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

The rules make a separate claim about the same code, so they don't declare the modules again:

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

Read `layers domain < application < presentation` as "domain is below application, which is below presentation." A dependency may only point down: `application` may use `domain`, but `domain` may not use `application` (that is K101). `infrastructure` is nested under the `layers` line, which puts it outside the order. Dependencies into it are allowed unless a `deny` says otherwise. A dependency out of it into an ordered layer needs an `allow`, and the `allow` line above grants exactly that.

A description is indented text under a node, written without a bullet. `fmt` moves it directly under its node. `check` ignores it; it is there for people.

The flow names the scenario and spells out its steps. A nested step is a call made inside its parent, and sibling steps read as "this, then that":

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

`kind` is either `business` or `technical`. `trigger` and `step` take exactly one id, while `reads` and `calls` take one or more; `trigger` may name the kind of entry point first (`route`, `cron`, `consumer`, `webhook`, `event`), as [lesson 6](06-flows.md) shows. `emits` takes an event name; the optional word `event` in front of it is not checked against the map, and a plain name such as `order.created` is prose. Only a name from the map's `events` group (`events.order_placed`) is checked. `? <text>` is an open question, not a claim: `check` ignores it, but a feature with an open question is not done. `invariant` and `when` take free text. `then` is a reference when its only token is an id containing a dot, and plain text otherwise. `test` takes a path and, optionally, a test name in quotes.

`planned` declares an intention, not a fact from the snapshot:

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
| K006 | warning | A heading that is not `map`, `rules`, `flow`, `wiring` or `migration` |
| K009 | error | A `parallel` with no `step` under it (from `check`, not `parse`) |

When a declared id is close to the one you wrote, K001 adds `did you mean …`, and when the id might be an intention it mentions `planned`. Warnings don't make `check` fail.

In CI, `keylang fmt --check` keeps a spec canonical without writing anything. A wrong id does not stop formatting, but a bad indent does.

Next: [the map](04-map.md).
