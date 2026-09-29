# 1. A shop

[Pre-course](README.md) · **English** · [Українською](uk/01-the-shop.md)

Picture a small program that sells things. A person types a cart. The program builds an order, counts the money, saves the order, and prints a receipt.

On the first day this is one file. It works. Then the file grows. You change the receipt and the total breaks. You change how orders are saved and the receipt breaks. A new person asks "where is the rule for the price?" and the honest answer is "somewhere in the middle of that file."

The fix is not a new framework. The fix is to separate the program by **job**, and to be able to say each job in one sentence.

## Four jobs

The shop example uses four groups. The names are ordinary words. They are not magic, and keylang does not require these particular names. This repository, which is the tool itself, uses different names (`base`, `lang`, `check`, …) because its jobs are different. The shop uses these:

| Group | The one sentence | What sits in it, in the example |
|---|---|---|
| `presentation` | What a person or another program touches | A terminal screen and an HTTP API |
| `application` | The task the shop performs | `purchase`: buy a cart, cancel an order |
| `domain` | The rules of an order, true even on paper | `orderAggregate`: create an order, count its total |
| `infrastructure` | The outside world: disk, network, process, log | Products, the order store, config, a logger, the server |

Hold those four sentences. Everything else in the language is a way to write them down and check that the code still obeys them.

The same cut, in the authors' words. Fowler stops at three layers. Cockburn's reason for the cut is that the program must still run with no screen and no database. The shop's fourth name, `application`, is the task that sits between those. [Part 4](04-reading.md) keeps the links, including the GitHub copies the authors published themselves.

> One of the most common ways to modularize an information-rich program is to separate it into three broad layers: presentation (UI), domain logic (aka business logic), and data access. […] It's biggest advantage (for me) is that it allows me to reduce the scope of my attention by allowing me to think about the three topics relatively independently.
>
> — Martin Fowler, [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html), 26 August 2015

> Create your application to work without either a UI or a database so you can run automated regression-tests against the application, work when the database becomes unavailable, and link applications together without any user involvement.
>
> — Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/), the 2005 article

A group like this is called a **layer**. A layer is a named pile of code with one job. A folder becomes a layer only when you can say the job. "Utilities" is usually not a job. "The rules of an order, true even on paper" is a job.

Inside a layer, a piece you can point at is a **module**. In the shop, `purchase` is a module in `application`. Inside a module, a named action is a **function**. `buy` is a function. A named shape of data, such as the error `OutOfStock`, is a **type**. You do not need a theory of types to use that word here. It means "a named kind of value this module declares."

## Need has a direction

`purchase.buy` cannot build an order by itself. It asks `orderAggregate` to create one, asks the product list to find the item, and asks the order store to save the result.

Say that as a sentence with a direction:

> `application.purchase` **needs** `domain.orderAggregate`.

The opposite sentence is a different decision:

> `domain.orderAggregate` **needs** `application.purchase`.

The second sentence is the one that hurts. The rules of an order would then know about the task that uses them. You could not read the price rule without also reading "buy." You could not try the price rule without standing up the task. The first sentence is the one the shop wants. The screen and the database may know about an order. The order does not know about the screen or the database.

That directed need is a **dependency**. The whole architecture this language can express is a list of those sentences, plus the scenarios you refuse to leave unnamed.

## The first failure is a wrong name

The shop example has a deliberate mistake. Under `purchase` the dependency is written `domain.aggregate`. The module that exists is `domain.orderAggregate`. There is no `aggregate`.

You do not need experience to see that. A document that names code is a claim that the name exists. A wrong name is a broken claim. keylang calls the name an **id**: a dotted path you can read left to right as layer, then module, then function.

```text
application . purchase . buy
layer         module      function
```

`domain.aggregate` does not walk that path to anything real. `domain.orderAggregate` does. Lesson 2 of the main course shows the command that prints this. You do not need the command yet. You need the habit: when you write a name in this language, you are pointing, not decorating.

## What you can do after this part

Open [`examples/shop/map.md`](../../../examples/shop/map.md) and find the four groups. Under `application` / `purchase`, find the line that says `domain.aggregate`. That line is the wrong pointing. The fixed copy is [`examples/shop-fixed/map.md`](../../../examples/shop-fixed/map.md), where the same line says `domain.orderAggregate`.

Next: [the words](02-the-words.md), one at a time, still on this shop.
