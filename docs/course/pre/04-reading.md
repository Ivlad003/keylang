# 4. What to read

[Pre-course](README.md) · **English** · [Українською](uk/04-reading.md)

A path from no architecture words to a project you can explain and check. Each item ties to a word in [part 2](02-the-words.md) or a principle in [part 3](03-principles.md).

A GitHub link appears only when the author or the publisher put the work there. Page numbers of paid books are left out. Stop when the shop in `examples/shop` is obvious. Come back when a real repository hurts in that way.

## Three meanings of "reliable"

| Kind | The question | What keylang checks | Where |
|---|---|---|---|
| The project stays understandable | Can you change the price rule without reading the database and the screen? | `layers`, `deny`, `no-cycles`, ids | This pre-course, then the path below |
| The scenario still happens | Does checkout still call `buy`, then create, then save? | A `# flow`, later a test and a trace | [Lesson 6](../06-flows.md) |
| The running system stays up | What happens when the disk fails or a request is hostile? | Nothing. keylang does not see production | The Google books at the end, after the structure is dull |

Start with the first row.

## The path

### 1. The shop, then one article

Read [part 1](01-the-shop.md). Then Martin Fowler, [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) (26 August 2015). He splits a program into presentation, domain logic, and data access, so work on the domain can ignore the screen. That is principles 1 and 3.

His earlier note [Presentation Domain Separation](https://martinfowler.com/bliki/PresentationDomainSeparation.html) (9 October 2003) says why the split pays: the domain is easier to test, a second screen does not copy the rule, and a web API is another presentation. The split is logical. It is not "put the layers on different machines."

> Don't make the mistake that this is a client/server physical separation. Even if all your code is running on the same machine, it's well worth making this logical separation.
>
> — Martin Fowler, [Presentation Domain Separation](https://martinfowler.com/bliki/PresentationDomainSeparation.html), 9 October 2003

keylang words: `presentation`, `domain`, `infrastructure` (his data access). The domain does not name the presentation.

### 2. Which slogans survived a vote

Fowler, [Layering Principles](https://martinfowler.com/bliki/LayeringPrinciples.html) (7 January 2005). A workshop voted. The score is for/against.

| Voted principle | Score | In keylang |
|---|---|---|
| Low coupling between layers, high cohesion inside one | 10/0 | One sentence per layer |
| Separation of concerns | 11/0 | The same idea |
| The user interface contains no business logic | 10/0 | You write the direction. The tool enforces the direction, not the wisdom |
| The business layer does not refer to user-interface modules | 8/0 | `deny domain presentation`, or domain below presentation |
| No circular references between layers | 8/0 | `no-cycles` |
| The business layer uses abstractions of technical services | 14/0 | Domain calls an alias such as `orders`, not a database driver |
| Layers are testable one at a time | 12/0 | A flow step names one function. A named test is the `tests` evidence |
| Layers are logical, not a deployment diagram | 11/0 | `keylang.json` groups files. It does not start processes |
| A lower layer does not depend on an upper layer | 6/0 | `layers a < b`. Need points down |

Do not take these as your default:

| Slogan | Score | Why |
|---|---|---|
| There are always at least three layer types | 3/9 | Four jobs, with `application` between screen and paper rule, are allowed |
| Separate teams by layer | 1/22 | A folder is not an org chart |
| A process per layer | 0/18 | Same warning: logical is not deployment |
| Rethrow exceptions at every layer boundary | 0/15 | Not a keylang concern |

"Layers may talk only to their neighbors" split the room (4/4). keylang's answer is the written exception: `allow`, with a sentence. The shop's server is that exception.

### 3. Needs point inward

Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (13 August 2012). The post's source is [in his site repository](https://github.com/unclebob/unclebob.github.io/blob/master/uncle-bob/_posts/2012-08-13-the-clean-architecture.md).

Under **The Dependency Rule**, source-code needs point inward. An inner circle does not mention a name from an outer circle. There is no rule that you must have exactly four circles. The call at runtime may go outward. The source-code need still points inward.

> There's no rule that says you must always have just these four. However, The Dependency Rule always applies. Source code dependencies always point inwards. As you move inwards the level of abstraction increases. The outermost circle is low level concrete detail.
>
> — Robert C. Martin, the same post, [source on GitHub](https://github.com/unclebob/unclebob.github.io/blob/master/uncle-bob/_posts/2012-08-13-the-clean-architecture.md)

`deny domain infrastructure` is that rule. `entry` is where control starts, on the outside.

His book *Clean Architecture* (Prentice Hall, 2017) adds: no cycles, and depend toward what changes less. Read the 2012 post first. Buy the book from the publisher when you want the longer argument.

In plain speech: a thing many others need should change rarely. The order's total is that center. The receipt layout is not. The domain does not import the receipt.

### 4. The database sits outside, next to the screen

Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/) (2005). He drew the database outside the application, symmetric with the screen, so people would stop treating storage as the bottom of a stack. The hexagon has no top and no bottom. The sides are ports. An adapter speaks a port in the dialect of a real device: HTTP, a database, a test.

> Many applications have only two ports: the user-side dialog and the database-side dialog. This gives them an asymmetric appearance, which makes it seem natural to build the application in a one-dimensional, three-, four-, or five-layer stacked architecture. […] The hexagonal, or ports and adapters, architecture solves these problems by noting the symmetry in the situation: there is an application on the inside communicating over some number of ports with things on the outside.
>
> — Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/), 2005

keylang words: `domain` and `application` are inside. `presentation` and `infrastructure` are outside. An `allow` from infrastructure to presentation is one adapter handed another. Write it down. You do not need a hexagon in the spec.

### 5. One free book, four chapters, then stop

Harry Percival and Bob Gregory, *Architecture Patterns with Python* (O'Reilly, 2020). Read it at [cosmicpython.com](https://www.cosmicpython.com/book/preface.html). The manuscript is [github.com/cosmicpython/book](https://github.com/cosmicpython/book). The example is [github.com/cosmicpython/code](https://github.com/cosmicpython/code), one branch per chapter. The online book and the code are CC BY-NC-ND: you may read and share them for non-commercial use with attribution. You may not republish a rewritten copy.

> Don't be put off if you're not working with (or interested in) microservices. The vast majority of the patterns we discuss, including much of the event-driven architecture material, is absolutely applicable in a monolithic architecture.
>
> — Harry Percival and Bob Gregory, [Preface](https://www.cosmicpython.com/book/preface.html)

Read only these, in order:

| Chapter | Why |
|---|---|
| [1. Domain Modeling](https://www.cosmicpython.com/book/chapter_01_domain_model.html) | A model with no web framework and no database. The shop's `domain` |
| [3. On Coupling and Abstractions](https://www.cosmicpython.com/book/chapter_03_abstractions.html) | What a module hides. Principle 1, with code |
| [4. Service Layer](https://www.cosmicpython.com/book/chapter_04_service_layer.html) | A use case as the entry. The shop's `application`, and why a flow has a trigger |
| [7. Aggregates and Consistency Boundaries](https://www.cosmicpython.com/book/chapter_07_aggregate.html) | Why `orderAggregate` is one module. The name in the shop is this word |

Chapter 2 (repository) is worth it when SQL starts leaking into the domain. Chapter 13 (dependency injection) is the idea behind `# wiring`, later. Their part 2, events and microservices, waits until one program is clear. Do not split the shop into services as a first move.

### 6. A dictionary, not a second tutorial

Eric Evans, *Domain-Driven Design* (Addison-Wesley, 2004) is commercial: [InformIT, ISBN 978-0-13-305296-1](https://www.informit.com/title/0133052966).

What you can read today is his [DDD Reference](https://www.domainlanguage.com/ddd/reference/), a free PDF, Creative Commons Attribution. A community typesetting of the same text is [github.com/ul/ddd-reference](https://github.com/ul/ddd-reference). The author's PDF is the source. He writes that the reference does not teach the ideas. It defines them for someone who has already met them.

> This document is meant as a convenient reference for those who know the principles of Domain-Driven Design (DDD). It does not contain full explanations of DDD or even of the terms and patterns covered.
>
> — Eric Evans, [DDD Reference](https://www.domainlanguage.com/ddd/reference/)

Use it after chapters 1 and 7 above.

| Name in the reference | The shop |
|---|---|
| Layered Architecture | The four jobs. "Three layers" is not mandatory |
| Entity, Value Object | What an order is made of. keylang calls a declared shape a `type` |
| Aggregate | `orderAggregate`: the cluster you load and save together |
| Repository | The infrastructure module that saves and finds orders |
| Service | A task that is not a thing. `purchase.buy` is closer to this than to an entity |

If a paragraph does not connect to the shop, skip it. Context maps are for several teams. Not the first month.

### 7. One real program, one question

*The Architecture of Open Source Applications*, edited by Amy Brown and Greg Wilson, is at [aosabook.org](https://aosabook.org/en/index.html) and [github.com/aosabook/aosabook](https://github.com/aosabook/aosabook), CC BY 3.0. Each chapter is one existing system, written by people who built it.

*500 Lines or Less* is [github.com/aosabook/500lines](https://github.com/aosabook/500lines). It walks through small programs and asks why the modules are cut this way.

> Architects look at thousands of buildings during their training, and study critiques of those buildings written by masters. In contrast, most software developers only ever get to know a handful of large programs well—usually programs they wrote themselves—and never study the great programs of history.
>
> — Amy Brown and Greg Wilson, [The Architecture of Open Source Applications](https://aosabook.org/en/index.html)

Read one chapter. In the margin, write who needs whom, which need you would `deny`, and where `entry` would be.

### 8. Drawings that are not a keylang file

**C4**, Simon Brown, [c4model.com](https://c4model.com/). Source: [github.com/simonbrowndotje/c4model](https://github.com/simonbrowndotje/c4model). Four levels of zoom: the system in the world, the containers you deploy, the components inside one container, the code. A keylang map is nearest the component and code levels of *one* repository. It is not a picture of your company, and it is not a deployment diagram.

**arc42**, Gernot Starke and Peter Hruschka, [arc42.org](https://arc42.org/). License: [arc42.org/license](https://arc42.org/license/), CC BY-SA 4.0. The building-block view is the cousin of a map. The runtime view is the cousin of a flow. "Checkout responds in this time" belongs in prose or an ADR. A `deny` line does not say it.

## After the structure is dull

- Google's *Site Reliability Engineering* and *The Site Reliability Workbook* are free at [sre.google/books](https://sre.google/books/). They are about operating a service. They assume the system already has a shape.
- *Building Secure and Reliable Systems* (2020) is free at [sre.google/books](https://sre.google/books/) and [google.github.io/building-secure-and-reliable-systems](https://google.github.io/building-secure-and-reliable-systems/). keylang will not see a privilege. You still decide it.
- Fowler's [catalog of *Patterns of Enterprise Application Architecture*](https://martinfowler.com/eaaCatalog/) (Addison-Wesley, 2002; the entries are on his site) is the dictionary for repository and service layer, after cosmicpython.
- *Designing Data-Intensive Applications* (Kleppmann), [dataintensive.net](https://dataintensive.net/), is for replication and consistency, not for folders. Do not start there.
- *Release It!* (Nygard) is for timeouts and retries. Same advice: not first.

## Not in the first month

- Do not collect PDFs the author did not publish.
- Do not start with microservices, event sourcing, or CQRS.
- Do not invent a layer because a book had a box with that label. Invent a layer when you can say its job, then write the `deny`.
- Do not expect keylang to check whether the running shop stays up. It checks who may know whom, and the steps of a scenario you named.

When the shop's wrong id, the `deny`, and one checkout flow are boring, go to [lesson 1](../01-what-it-is.md).
