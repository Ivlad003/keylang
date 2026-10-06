# 1. A shop

[Pre-course](README.md) · **English** · [Українською](uk/01-the-shop.md)

Picture a small program that sells things. A person fills in a cart, and the program builds an order from it, counts the money, saves the order and prints a receipt.

On day one all of this fits in one file, and it works. Then the file grows. You change the receipt and the total breaks; you change how orders are saved and now the receipt breaks. A new person on the team asks "where is the price rule?", and the honest answer is "somewhere in the middle of that file."

The fix is not a new framework. Instead, split the program by **job**, and make sure you can say each job in one sentence.

## Four jobs

The shop is split into four groups. Their names are ordinary words, and keylang does not require them: this repository, which is the tool itself, uses other names (`base`, `lang`, `check`, …) because its jobs are different.

| Group | The one sentence | In the example |
|---|---|---|
| `presentation` | What a person or another program touches | A terminal screen and an HTTP API |
| `application` | The task the shop performs | `purchase`: buy a cart, cancel an order |
| `domain` | The rules of an order, true even on paper | `orderAggregate`: create an order, count its total |
| `infrastructure` | The outside world: disk, network, process, log | Products, the order store, config, a logger, the server |

Keep those four sentences in mind. The rest of the language is simply a way to write them down and to check that the code still obeys them.

Martin Fowler stops at three layers. Alistair Cockburn gives the reason for cutting the program this way: it must still run with no screen and no database. The shop's fourth name, `application`, is the task that sits between those two. The links to both sources are collected in [Part 4](04-reading.md).

> One of the most common ways to modularize an information-rich program is to separate it into three broad layers: presentation (UI), domain logic (aka business logic), and data access. […] It's biggest advantage (for me) is that it allows me to reduce the scope of my attention by allowing me to think about the three topics relatively independently.
>
> — Martin Fowler, [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html), 26 August 2015

> Create your application to work without either a UI or a database so you can run automated regression-tests against the application, work when the database becomes unavailable, and link applications together without any user involvement.
>
> — Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/), the 2005 article

A group like this is called a **layer**: a named pile of code with one job. A folder counts as a layer only when you can say what its job is. "Utilities" is usually not a job, while "the rules of an order, true even on paper" is.

Inside a layer, any piece you can point at is a **module**; in the shop, `purchase` is a module in `application`. Inside a module, a named action is a **function**, such as `buy`. A named shape of data, such as the error `OutOfStock`, is a **type**. Here the word simply means "a named kind of value that this module declares."

## Need has a direction

`purchase.buy` cannot build an order on its own. It asks `orderAggregate` to create the order, asks the product list to find the item, and asks the order store to save the result.

Put that into a sentence with a direction:

> `application.purchase` **needs** `domain.orderAggregate`.

The opposite sentence is a different decision:

> `domain.orderAggregate` **needs** `application.purchase`.

The second sentence hurts, because the rules of an order would then know about the task that uses them, and you could not read the price rule without also reading "buy." The screen and the database may know about an order, but the order does not know about the screen or the database.

That directed need is called a **dependency**. The architecture this language can express is a list of such sentences, plus the scenarios you refuse to leave unnamed.

## The first failure is a wrong name

The shop example contains a deliberate mistake. Under `purchase`, the dependency is written as `domain.aggregate`, but the module that actually exists is `domain.orderAggregate`, and there is no `aggregate`.

A document that names code is making a claim that the name exists, so a wrong name is a broken claim. keylang calls such a name an **id**: a dotted path that goes from the layer to the module and then to the function.

```text
application . purchase . buy
layer         module      function
```

`domain.aggregate` points at nothing, while `domain.orderAggregate` points at the module. Lesson 2 of the main course shows the command that prints this, but you do not need the command yet. What matters now is that writing a name in this language means pointing at something, not decorating the text. The name is yours to write; the function behind it is the agent's job, not yours.

## After this part

Open [`examples/shop/map.md`](../../../examples/shop/map.md) and find the four groups. Then, under `application` / `purchase`, find `domain.aggregate`: that is the line that points at the wrong name. The fixed copy is [`examples/shop-fixed/map.md`](../../../examples/shop-fixed/map.md), where the same line says `domain.orderAggregate`.

Next: [the words](02-the-words.md), one at a time, still on the same shop.
