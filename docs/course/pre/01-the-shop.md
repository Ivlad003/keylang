# 1. A shop

[Pre-course](README.md) · **English** · [Українською](uk/01-the-shop.md)

Picture a small program that sells things. A person types a cart. The program builds an order, counts the money, saves the order, and prints a receipt.

On day one this is one file. It works. Then the file grows. You change the receipt and the total breaks. You change how orders are saved and the receipt breaks. A new person asks "where is the price rule?" The honest answer is "somewhere in the middle of that file."

The fix is not a new framework. Split the program by **job**. Say each job in one sentence.

## Four jobs

The shop uses four groups. The names are ordinary words. keylang does not require these names. This repository, the tool itself, uses other names (`base`, `lang`, `check`, …) because its jobs are different.

| Group | The one sentence | In the example |
|---|---|---|
| `presentation` | What a person or another program touches | A terminal screen and an HTTP API |
| `application` | The task the shop performs | `purchase`: buy a cart, cancel an order |
| `domain` | The rules of an order, true even on paper | `orderAggregate`: create an order, count its total |
| `infrastructure` | The outside world: disk, network, process, log | Products, the order store, config, a logger, the server |

Hold those four sentences. The rest of the language is a way to write them down and check that the code still obeys them.

Fowler stops at three layers. Cockburn's reason for the cut is that the program must still run with no screen and no database. The shop's fourth name, `application`, is the task between those. [Part 4](04-reading.md) keeps the links.

> One of the most common ways to modularize an information-rich program is to separate it into three broad layers: presentation (UI), domain logic (aka business logic), and data access. […] It's biggest advantage (for me) is that it allows me to reduce the scope of my attention by allowing me to think about the three topics relatively independently.
>
> — Martin Fowler, [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html), 26 August 2015

> Create your application to work without either a UI or a database so you can run automated regression-tests against the application, work when the database becomes unavailable, and link applications together without any user involvement.
>
> — Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/), the 2005 article

A group like this is a **layer**. A layer is a named pile of code with one job. A folder is a layer only when you can say the job. "Utilities" is usually not a job. "The rules of an order, true even on paper" is a job.

Inside a layer, a piece you can point at is a **module**. In the shop, `purchase` is a module in `application`. Inside a module, a named action is a **function**. `buy` is a function. A named shape of data, such as the error `OutOfStock`, is a **type**. Here that word means "a named kind of value this module declares."

## Need has a direction

`purchase.buy` cannot build an order alone. It asks `orderAggregate` to create one, asks the product list to find the item, and asks the order store to save the result.

Say it with a direction:

> `application.purchase` **needs** `domain.orderAggregate`.

The opposite sentence is a different decision:

> `domain.orderAggregate` **needs** `application.purchase`.

The second sentence hurts. The rules of an order would then know about the task that uses them. You could not read the price rule without also reading "buy." The screen and the database may know about an order. The order does not know about the screen or the database.

That directed need is a **dependency**. The architecture this language can express is a list of those sentences, plus the scenarios you refuse to leave unnamed.

## The first failure is a wrong name

The shop example has a deliberate mistake. Under `purchase` the dependency is written `domain.aggregate`. The module that exists is `domain.orderAggregate`. There is no `aggregate`.

A document that names code is a claim that the name exists. A wrong name is a broken claim. keylang calls the name an **id**: a dotted path, layer, then module, then function.

```text
application . purchase . buy
layer         module      function
```

`domain.aggregate` points at nothing. `domain.orderAggregate` points at the module. Lesson 2 of the main course shows the command that prints this. You do not need the command yet. When you write a name in this language, you are pointing, not decorating.

## After this part

Open [`examples/shop/map.md`](../../../examples/shop/map.md) and find the four groups. Under `application` / `purchase`, find `domain.aggregate`. That line points wrong. The fixed copy is [`examples/shop-fixed/map.md`](../../../examples/shop-fixed/map.md), where the same line says `domain.orderAggregate`.

Next: [the words](02-the-words.md), one at a time, still on this shop.
