# keylang grammar cheatsheet

One page of the keylang language for agents: what to write where, with examples that `keylang check` reads without a spec error. The normative text is [grammar.md](grammar.md) and [semantics.md](semantics.md) (Ukrainian); where they disagree with this page, they win. Commands are in [cli.md](cli.md), MCP tools in [mcp-lsp.md](mcp-lsp.md).

## Files

Specs are Markdown under the spec directory: `dir` in `keylang.json`, `keylang/` by default. A level-one heading starts a section, and its kind decides how the list below it is read, whatever the file is called.

| Heading | Section | Usual file |
|---|---|---|
| `# map` | layers, modules, members | `keylang/map/*.md`, written by `keylang map`; read it, never edit it |
| `# rules` | dependency rules | `keylang/rules.md` (a person's), `keylang/rules.baseline.md` (written by `init` and `keylang baseline`) |
| `# flow <name>` | one scenario; the name is required and unique | `keylang/flows/*.md`, `keylang/features/<slug>.md` |
| `# wiring` | factories for `keylang wire` | `keylang/wiring.md` |
| `# migration <name>` | old-stack IDs mapped to this repository's; the name is required | `keylang/migration.md` (`keylang flow import` proposes rows) |

An item is a list line, `- <keyword> <arguments>`. A child is indented exactly two spaces more than its parent; any other indent or a tab is K003. Paragraphs, `##` headings, tables and code fences are prose without meaning. Text indented under an item is its description, and `<!-- … -->` at the end of an item is a comment.

## IDs

An ID is a dotted path from the root of the map: layer, module, member. With layer `app` on `src/app/**`, the file `src/app/orders.ts` is the module `app.orders`; its function `place` is `app.orders.place`, a method of its class `Cart` is `app.orders.Cart.add`, and a package is `external.<pkg>`. Copy IDs from `keylang/map/*.md` or MCP `search` and never shorten one. Renaming or moving a file changes its IDs; `keylang map` writes the new map. An ID can be written as a link, `[app.orders.place](../map/app.md)`: the text is the ID, the target is not checked. Code that does not exist yet is a `planned` ID, not a dangling one.

## Keywords by position

A word is a keyword only where this table allows it; elsewhere the line falls back to the right column.

| Position | Keywords | A line without a keyword |
|---|---|---|
| top of a map section | `layer`, `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | `<name>`: a layer |
| top of a rules section | `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | K004 |
| top of a flow section | `kind`, `trigger`, `continues`, `step`, `parallel`, `reads`, `emits`, `calls`, `invariant`, `when`, `after`, `every`, `test`, `planned`, `?` | K004 |
| top of a wiring section | `wire` | K004 |
| top of a migration section | `map`, `dropped` | K004 |
| under `layer` | `module`, `event` (the generated `events` group) | `<name>`: a module |
| under `module` (map) | `module`, `fn`, `type`, `event` | `<alias> <id>`: a dependency |
| under `fn`, `event` | `calls` (under `event`: the observers the framework calls) | K004 |
| under `layers`, `entry` | none | `<id>`: a reference |
| under `module` (rules) | `exports`, `no-cycles` | K004 |
| under `trigger`, `step` | `step`, `parallel`, `reads`, `emits`, `calls`, `when`, `after`, `every`, `test`, `invariant`, `?` | K004 |
| under `when` (flow) | `then`, `step`, `parallel`, `test`, `?` | K004 |
| under `parallel` | `step` | K004 |
| under `invariant`, `then`, `after`, `every` | `test` | K004 |
| under `wire` | none | `<name> <id>`: the dependency `name`, built by the factory `<id>` |
| under a dependency of `wire` | `when`, `compose` | K004 |
| under anything else | none | K004: it cannot have nested items |

Keywords are contextual: under a map module, `- test foo.bar` is a dependency named `test`, because `test` is a keyword only in flows.

## Arguments

`<id>` is a bare ID or a link `[id](href)`. A wrong count or form of arguments is K005.

| Form | Arguments | Meaning |
|---|---|---|
| `layer <name>`, `<name>` | one name | declares a layer |
| `module <name>`, `<name>` under a layer | one name or link | declares `<layer>.<name>` |
| `fn`, `type`, `event` `<name> <signature…>` | a name, then free text | declares `<module>.<name>`; the rest is its signature |
| `<alias> <id>` under a map module | two tokens | a dependency `<module>.<alias>` on `<id>` |
| `calls`, `reads` `<id>[, <id>…]` | one or more IDs | references |
| `layers <a> < <b> < …` | layer names joined by `<` | a lower layer never depends on a higher one; nested `<id>` lines are layers outside the order |
| `allow`, `deny` `<from> <to>…` | two or more layers or modules, or their prefixes | the first may (not) depend on the rest; an fn, type, event or alias is K005 |
| `entry` | none; nested `<id>` lines | start points: a module none of them reaches is K103 |
| `module <id>` in rules | one module | the module its nested `exports` and `no-cycles` are about |
| `exports <name>[, <name>…]` | public names, not IDs | the module's public exports, exactly |
| `no-cycles` | none | no import cycle: in the whole graph at the top; under `module`, through that module |
| `kind business`, `kind technical` | one of the two words | a label |
| `trigger <id>`, `step <id>` | one ID | the flow's entry function; a call from the parent step or the trigger |
| `trigger route\|cron\|consumer\|webhook <id>` | a kind, the ID of the entry point's fn | the fn must be an entry point of that kind in `keylang entries` (K205 for another kind); the verdict shows its label |
| `trigger event <id>` | an event ID, `events.<name>` | the flow of the event's subscribers: the verdict lists them with their config lines; each step right under it must be reached from one subscriber; an unknown event is K204, a fn K205 |
| `parallel` | none; nested `step` lines | the steps run in any order, each reached from the group's parent; the next step comes after the whole group; none is K009 |
| `continues <flow>` | a flow name | this flow continues that one in a later request; a missing flow is K206; trace is `unverified (crosses requests)` |
| `after <duration>` | `30s`, `15m`, `2h`, `1d` (ms, s, m, min, h, d, w) | a timer; only a nested `test` checks it |
| `every <schedule>` | a duration, `@daily` and the other cron macros, or five or six cron fields (bare or quoted) | a schedule; a nested `test` checks it, and the schedule of a cron entry point when the snapshot has one |
| `planned fn`, `module`, `type`, `event` `<id> [signature]` | a kind, an ID, optional free text | an intention: code that does not exist yet; top of a flow only |
| `emits [event] <name>` | an event name | an event ID (`events.<name>`): the step's code must dispatch it (`ok`, `fail` absence, `unverified` for a computed name or a hole on the way; K204 for an unknown event); any other name: text, not resolved |
| `invariant <text>` | free text | a claim keylang does not parse; a nested `test` proves it |
| `? <text>` | free text, required | an open question for a person, not a claim |
| `when <text>` (flow) | free text | a condition; its children are its branch |
| `then <id>`, `then <text>` | one dotted ID, else text | a reference, or text |
| `test <file> ["<name>"]` | a path and an optional quoted name | the test that proves the line |
| `wire <id>`, `compose <id>` | one ID | a factory; a one-argument fn that wraps the dependency's value |
| `when env.NAME = value → <id>` (wiring) | a condition, `→` or `->`, an ID | another factory when the variable has that value |
| `map <old id> → [planned] <id>` (migration) | an old-stack ID, `→` or `->`, optional `planned`, an ID here | the new ID must be in the code or declared `planned` (else K001); the old one is checked against `migration.from` in `keylang.json` |
| `dropped <old id> <reason>` (migration) | an old-stack ID and a reason | not moved on purpose; no reason is K005 |

## Examples

The examples describe one repository: every ID they name is declared in the map of the first one, or is `planned`.

The map, as `keylang map` writes it (shortened). The first line is the generated marker: never edit such a file. A generated map writes a layer as its bare name; `- layer ui` means the same. A dependency line is `<alias> <module id>`:

```keylang
<!-- keylang:generated — не редагувати, `keylang map` -->

# map

- ui
  - module [cli](../../src/ui/cli.ts#L1)
    - orders app.orders
    - fn [main](../../src/ui/cli.ts#L4) (argv: string[]) → Promise<number>
      - calls app.orders.place
  - module [http](../../src/ui/http.ts#L1)
    - orders app.orders
    - fn [placeOrder](../../src/ui/http.ts#L4) (req: Request) → void
      - calls app.orders.place
- app
  - module [orders](../../src/app/orders.ts#L1)
    - order domain.order
    - db infra.db
    - fn [place](../../src/app/orders.ts#L6) (items: Item[]) → Order
      - calls domain.order.create, infra.db.save
- domain
  - module [order](../../src/domain/order.ts#L1)
    - type [Order](../../src/domain/order.ts#L3)
    - type [OutOfStock](../../src/domain/order.ts#L8)
    - fn [create](../../src/domain/order.ts#L12) (items: Item[]) → Order
- infra
  - module [db](../../src/infra/db.ts#L1)
    - fn [open](../../src/infra/db.ts#L5) (url: string) → Db
    - fn [save](../../src/infra/db.ts#L12) (order: Order) → void
  - module [memory](../../src/infra/memory.ts#L1)
    - fn [open](../../src/infra/memory.ts#L3) () → Db
  - module [log](../../src/infra/log.ts#L1)
    - fn [wrap](../../src/infra/log.ts#L2) (db: Db) → Db
```

Layer order: a dependency only goes down, so `ui` may use `app` and `domain`, `app` may use `domain`, and an upward one is K101. A layer nested under `layers` is outside the order: a dependency into `infra` is free unless a `deny` forbids it, one from `infra` into an ordered layer is K101 unless an `allow` permits it:

```keylang
# rules

- layers domain < app < ui
  - infra
```

Forbidden and allowed edges. The more specific rule wins, so `app.orders` may use `infra` and the rest of `app` may not (K102). `external` is every package:

```keylang
# rules

- deny domain infra
- deny domain external
- deny app infra
- allow app.orders infra
```

Reachability, public names and cycles:

```keylang
# rules

- entry
  - ui.cli
- module app.orders
  - exports place
  - no-cycles
- no-cycles
```

A flow: the trigger is a plain named function, each step a call from its parent, siblings in order. Prose under the heading is a description:

```keylang
# flow checkout

The buyer places an order from the command line.

- kind business
- trigger ui.cli.main
  - step app.orders.place
    - step domain.order.create
    - step infra.db.save
```

Direct calls in any order, what a step reads and emits:

```keylang
# flow place

- trigger app.orders.place
  - calls domain.order.create, infra.db.save
  - reads domain.order.Order
  - emits event order.placed
```

A branch. One dotted ID after `then` is a reference; several words are text:

```keylang
# flow stock

- trigger app.orders.place
  - when the stock is empty
    - then domain.order.OutOfStock
    - then retry 3 times, then give up
    - ? does the buyer get an email?
```

A claim and the test that proves it:

```keylang
# flow total

- trigger domain.order.create
  - invariant the total is the sum of the line prices
    - test tests/orders.test.ts "total sums the lines"
```

A feature file: what to build is `planned`, a package not imported yet is `planned module external.<pkg>`, and an open question waits for a person. `keylang feature refund` says what is still missing:

```keylang
# flow refund

- planned fn app.orders.refund (order: Order) → Refund
- planned module external.stripe
- trigger ui.cli.main
  - step app.orders.refund
    - step external.stripe
- ? Can an operator refund part of an order?
```

A flow from an entry point. `keylang entries` lists `route  POST /orders  ui.http.placeOrder`, so the trigger names that kind and the fn, not the path. The two steps of `parallel` run in any order; `continues` says this flow goes on in a later request of `checkout`; `after` and `every` are timers:

```keylang
# flow order

- kind business
- trigger route ui.http.placeOrder
  - step app.orders.place
    - parallel
      - step domain.order.create
      - step infra.db.save
    - after 30m
- continues checkout
```

A migration table, when this repository replaces an old one: the old IDs are checked against `migration.from` in `keylang.json`, and `keylang migration status` compares the flows of both stacks:

```keylang
# migration shop

- map Checkout.Order.place → app.orders.place
- map Checkout.Order.refund → planned app.orders.refund
- dropped Checkout.Legacy.export the CSV export is not moved
```

Links instead of bare IDs, for a click on GitHub or in an editor:

```keylang
# flow linked

- trigger [ui.cli.main](../map/ui.md)
  - step [app.orders.place](../map/app.md)
```

Wiring: `wire` builds `app.orders.place` with a `db` from `infra.db.open`, or from `infra.memory.open` when `DB=memory`, wrapped by `infra.log.wrap`:

```keylang
# wiring

- wire app.orders.place
  - db infra.db.open
    - when env.DB = memory → infra.memory.open
    - compose infra.log.wrap
```

## Diagnostics

`keylang check` prints `file:line:col: CODE message`. Errors fail the check (exit 1); warnings do not. `keylang explain <code>` says why and how to fix it.

| Code | Level | Meaning |
|---|---|---|
| K001 | error | dangling reference: the ID is not in the map; declare `planned` for an intention |
| K002 | error | the same ID or flow name declared twice |
| K003 | error | structure: an odd indent, a jump of more than one level, a tab in the indent, an empty item |
| K004 | error | a keyword unknown or not allowed at this position |
| K005 | error | wrong arguments of a known keyword, or an invalid ID, link or quote |
| K006 | warning | an unknown section heading; the section is read as a map |
| K008 | warning | a one-word `then` equals the last segment of a declared ID and stays text |
| K009 | error | a `parallel` with no `step` under it |
| K101 | error | a dependency against the `layers` order: upward, or from a layer outside the order into an ordered one |
| K102 | error | a dependency that a `deny` forbids |
| K103 | warning | a module that no `entry` reaches |
| K104 | error | `exports` and the module's real public exports differ |
| K105 | error | a dependency cycle where `no-cycles` is declared |
| K106 | warning | an `allow` and a `deny` that cannot be ordered (each narrower on one side, the `allow` deeper in sum) and no rule on their intersection |
| K107 | error | architecture code depends on a file that `outside` in `keylang.json` puts outside it |
| K108 | error | the spec was weakened since the base commit: a wider `exclude`, `assume` or `outside`, a `layers` glob that moves a file out of its layer, `frameworks` turned off, a removed `deny`, `step` or `trigger`, a new `allow`, a rule outside `rules.md`. Only `check --changed`, `hook stop` and `feature` report it; a person accepts it with `check --changed --accept-weakening` |
| K201 | error | a `planned` ID exists in the code with another kind or signature |
| K202 | warning | a `planned` ID is implemented as declared: remove the `planned` line |
| K203 | warning | a flow's `test` names a file the repository does not have |
| K204 | error | `trigger event <id>` or `emits event events.<name>` names an event no code dispatches and no config observes |
| K205 | error | `trigger <kind> <id>`: the snapshot records the fn as an entry point of another kind; `trigger event` names a fn, type or module |
| K206 | error | `continues <flow>` names a flow that does not exist |
| K301 | error | a cycle between `wire` factories |
| K302 | error | a `wire` target, dependency or `compose` the generated file cannot build |

On a flow line, `check` prints one verdict per kind of evidence: `ID` (the symbol exists), `static` (a call path from the parent), and, when configured, `tests` and `trace`. A verdict is `ok`, `fail` or `unverified`: `unverified` is a gap keylang could not close, never a pass.
