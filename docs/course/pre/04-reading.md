# 4. What to read

[Pre-course](README.md) · **English** · [Українською](uk/04-reading.md)

This is a reading path from no architecture vocabulary to a project whose structure you can explain and check. It is not a bibliography of everything famous. Each item is tied to a word in [part 2](02-the-words.md) or a principle in [part 3](03-principles.md).

GitHub search for "architecture book pdf" mostly returns copies of commercial books that the authors did not put there. Those links are not in this page. Below, a GitHub repository appears only when the author or the publisher put the work there under a license that allows reading it, or when the repository is the source of a free site.

Page numbers of paid books are omitted. Where a free text has a chapter or a heading, that heading is the citation.

## What "good and reliable" splits into

Three different literatures use the word reliable. Mixing them is how a beginner buys the wrong book.

| Kind of reliability | The question | What keylang can check | Where to read |
|---|---|---|---|
| The project stays understandable | Can a person change the price rule without reading the database and the screen? | `layers`, `deny`, `no-cycles`, ids | This pre-course, then the sources in the path below |
| The scenario still happens | Does checkout still call `buy`, then create, then save? | A `# flow`, and later tests and a trace | [Lesson 6](../06-flows.md) of the course. Tests themselves are not a substitute the tool writes for you |
| The running system stays up and keeps data safe | What happens when the disk fails, the deploy is bad, or a request is hostile? | Nothing. keylang does not see production | The Google books at the end, after the structure is boringly clear |

Start with the first row. A reliable process on top of a ball of mud is how teams get fast at shipping accidents.

## A path, in order

Do these in order. Stop when the shop in `examples/shop` is obvious. Come back for the later items when a real repository hurts in that particular way.

### 1. The shop, then one article

Read [part 1](01-the-shop.md) of this pre-course. Then Martin Fowler, [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) (26 August 2015).

He separates an information-rich program into presentation, domain logic, and data access, so that work on the domain can ignore the screen and treat storage as functions. That is principle 1 and principle 3. His earlier note [Presentation Domain Separation](https://martinfowler.com/bliki/PresentationDomainSeparation.html) (9 October 2003) lists why the split pays: the domain is easier to test, a second screen does not duplicate the rule, and a web API is another presentation, not a different program. He also says the split is logical. It is not "put the layers on different machines."

> Don't make the mistake that this is a client/server physical separation. Even if all your code is running on the same machine, it's well worth making this logical separation.
>
> — Martin Fowler, [Presentation Domain Separation](https://martinfowler.com/bliki/PresentationDomainSeparation.html), 9 October 2003

keylang words: `presentation`, `domain`, `infrastructure` (his data access), and the rule that the domain does not name the presentation.

### 2. Which layering slogans survived a vote

Fowler, [Layering Principles](https://martinfowler.com/bliki/LayeringPrinciples.html) (7 January 2005). A workshop listed slogans people had heard, then voted. The score is written as positive/negative.

Use these, they map directly onto a `rules` file:

| Voted principle | Score | In keylang |
|---|---|---|
| Low coupling between layers, high cohesion inside one | 10/0 | One sentence per layer. A layer whose sentence is "misc" will not stay cohesive |
| Separation of concerns | 11/0 | The same idea, said as a goal |
| The user interface contains no business logic | 10/0 | `deny` from presentation's job into "the rule lives only here" is the human decision. The tool enforces the direction you wrote, not the wisdom of the sentence |
| The business layer does not refer to user-interface modules | 8/0 | `deny domain presentation`, or a `layers` line with domain below presentation |
| No circular references between layers | 8/0 | `no-cycles` |
| The business layer uses abstractions of technical services, not the technology itself | 14/0 | Domain calls an alias such as `orders`, not a database driver. The alias's id lives in infrastructure |
| Layers are testable one at a time | 12/0 | A flow step names one function. A test named on that step is the evidence `tests` |
| Layers are a logical fact, not a deployment diagram | 11/0 | `keylang.json` groups files. It does not start processes |
| A lower layer does not depend on an upper layer | 6/0 | `layers a < b` and need pointing down |

Treat these as rejected, or at least not your default:

| Slogan | Score | Why it matters |
|---|---|---|
| There are always at least three layer types: presentation, domain, data | 3/9 | The shop's four jobs, and an `application` task between screen and paper rule, are allowed. Do not force a diagram to three boxes |
| Separate teams by layer | 1/22 | A folder is not an org chart |
| Distribute at layer boundaries (a process per layer) | 0/18 | Same warning as the logical-versus-deployment vote |
| Rethrow exceptions at every layer boundary | 0/15 | Not a keylang concern, and not a habit to copy |

"Layers may talk only to their neighbors" split the room (4/4, and a stricter wording 2/3). keylang's answer is the written exception: `allow`, with a sentence for the reader. The shop's server is that exception.

### 3. Dependencies point inward

Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (13 August 2012). The source of that post is in his site repository: [the Markdown file](https://github.com/unclebob/unclebob.github.io/blob/master/uncle-bob/_posts/2012-08-13-the-clean-architecture.md).

The heading **The Dependency Rule** says source-code dependencies point inward. An inner circle does not mention a name declared in an outer circle. Outer circles are mechanisms. Inner circles are policy. He writes that there is no rule that you must have exactly four circles. The dependency rule still applies. He also separates the flow of control (the call at runtime, which may go outward) from the source-code dependency (which still points inward), and names the Dependency Inversion Principle as the way the two can disagree.

> There's no rule that says you must always have just these four. However, The Dependency Rule always applies. Source code dependencies always point inwards. As you move inwards the level of abstraction increases. The outermost circle is low level concrete detail.
>
> — Robert C. Martin, the same post, [source on GitHub](https://github.com/unclebob/unclebob.github.io/blob/master/uncle-bob/_posts/2012-08-13-the-clean-architecture.md)

That is principle 2 and principle 3, said without the shop's names. `deny domain infrastructure` is a dependency rule. `entry` is the outer circle where control starts.

His book *Clean Architecture* (Prentice Hall, 2017) expands the same rule and adds the component principles: no cycles in the dependency graph, and depend toward what is more stable. Read the 2012 post first. Buy the book when you want the longer argument, from the publisher, not from a random repository.

The Stable Dependencies Principle, in plain speech: a thing that many others need should change rarely, and a thing that changes often should not be needed by the stable center. The order's total is the stable center. The receipt layout is not. The domain does not import the receipt.

### 4. The database is outside, next to the screen

Alistair Cockburn, the original ports-and-adapters article, linked from his own article list as [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/) (the 2005 text; he still points readers there). The picture is older than the name. He has said he drew the database outside the application, symmetric with the user interface, so people would stop treating storage as the bottom of a stack. The hexagon was a shape that had no top and no bottom. The sides became ports. An adapter is the piece that speaks a port in the dialect of a real device: HTTP, a database, a test.

> Many applications have only two ports: the user-side dialog and the database-side dialog. This gives them an asymmetric appearance, which makes it seem natural to build the application in a one-dimensional, three-, four-, or five-layer stacked architecture. […] The hexagonal, or ports and adapters, architecture solves these problems by noting the symmetry in the situation: there is an application on the inside communicating over some number of ports with things on the outside.
>
> — Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/), 2005

keylang words: `domain` and `application` are inside. `presentation` and `infrastructure` are adapters on the outside. An `allow` from infrastructure to presentation is one adapter being handed another, which you should notice and write down.

You do not need a hexagon in the spec. You need the sentence the drawing was for.

### 5. One free book, four chapters, then stop

Harry Percival and Bob Gregory, *Architecture Patterns with Python* (O'Reilly, 2020). The authors publish the text to read at [cosmicpython.com](https://www.cosmicpython.com/book/preface.html) and keep the manuscript in [github.com/cosmicpython/book](https://github.com/cosmicpython/book). The running example is [github.com/cosmicpython/code](https://github.com/cosmicpython/code), one branch per chapter. The online book and the code are under Creative Commons BY-NC-ND: you may read and share them for non-commercial use with attribution. You may not republish a rewritten copy. The print edition has its own license; see the preface.

Their preface says the reader is not expected to know domain-driven design, and that the book is the stuff they had to teach new programmers. That is the right level after this pre-course.

> Don't be put off if you're not working with (or interested in) microservices. The vast majority of the patterns we discuss, including much of the event-driven architecture material, is absolutely applicable in a monolithic architecture.
>
> — Harry Percival and Bob Gregory, [Preface](https://www.cosmicpython.com/book/preface.html). Manuscript: [github.com/cosmicpython/book](https://github.com/cosmicpython/book). Example: [github.com/cosmicpython/code](https://github.com/cosmicpython/code).

Read only these, in this order:

| Chapter | Why it is this course |
|---|---|
| [1. Domain Modeling](https://www.cosmicpython.com/book/chapter_01_domain_model.html) | A model of the business with no web framework and no database. This is the shop's `domain` |
| [3. On Coupling and Abstractions](https://www.cosmicpython.com/book/chapter_03_abstractions.html) | How to choose what a module hides. Principle 1, said with code |
| [4. Service Layer](https://www.cosmicpython.com/book/chapter_04_service_layer.html) | A use case as the entry of the system. This is the shop's `application` and the reason a flow has a trigger |
| [7. Aggregates and Consistency Boundaries](https://www.cosmicpython.com/book/chapter_07_aggregate.html) | Why `orderAggregate` is one module and not a pile of rows. The name in the shop example is this word |

Chapter 2 (repository) is worth it when saving an order starts to leak SQL into the domain. Chapter 13 (dependency injection) is the idea behind `# wiring`, later. Part 2 of their book, events and microservices, waits until one program is already clear. Their preface says most of the patterns still apply inside one process. Believe that, and do not split the shop into services as a first move.

### 6. A dictionary, not a second tutorial

Eric Evans, *Domain-Driven Design* (Addison-Wesley, 2004) is the book cosmicpython tells you to read eventually. It is commercial. The official page is [InformIT, ISBN 978-0-13-305296-1](https://www.informit.com/title/0133052966).

What you can read today is his own summary, the [DDD Reference](https://www.domainlanguage.com/ddd/reference/), a free PDF, Creative Commons Attribution. A community typesetting of that same text is [github.com/ul/ddd-reference](https://github.com/ul/ddd-reference); the author's PDF remains the source. Evans writes on his page that the reference does not teach the ideas. It defines them for someone who has already met them.

> This document is meant as a convenient reference for those who know the principles of Domain-Driven Design (DDD). It does not contain full explanations of DDD or even of the terms and patterns covered.
>
> — Eric Evans, [DDD Reference](https://www.domainlanguage.com/ddd/reference/) Use it after chapter 1 and chapter 7 above, and look up these pattern names when the shop's words feel fuzzy:

| Pattern name in the reference | The shop |
|---|---|
| Layered Architecture | The four jobs, with the warning from the 2005 vote that "three layers" is not mandatory |
| Entity, Value Object | The things an order is made of. keylang will call a declared shape a `type` |
| Aggregate | `orderAggregate`: the cluster you load and save together so the total stays true |
| Repository | The infrastructure module that saves and finds orders, so the domain does not speak SQL |
| Service | A task that is not a thing. `purchase.buy` is closer to this than to an entity |

The reference is a dictionary. If a paragraph in it does not connect to the shop, skip it. Strategic design, context maps, and distillation are for several teams and several models. They are real, and they are not the first month.

### 7. Look at one real program and ask one question

*The Architecture of Open Source Applications*, edited by Amy Brown and Greg Wilson, is published to read and is in [github.com/aosabook/aosabook](https://github.com/aosabook/aosabook) under Creative Commons Attribution 3.0. The site linked from editions of the book is [aosabook.org](https://aosabook.org/en/index.html). Each chapter is one existing system, written by people who built it.

*500 Lines or Less*, the fourth volume, is [github.com/aosabook/500lines](https://github.com/aosabook/500lines). Its own introduction says the earlier volumes are hard to absorb before you have built at that scale, and this volume walks through small programs asking why the modules are cut this way.

> Architects look at thousands of buildings during their training, and study critiques of those buildings written by masters. In contrast, most software developers only ever get to know a handful of large programs well—usually programs they wrote themselves—and never study the great programs of history.
>
> — Amy Brown and Greg Wilson, [The Architecture of Open Source Applications](https://aosabook.org/en/index.html). Source: [github.com/aosabook/aosabook](https://github.com/aosabook/aosabook), CC BY 3.0.

Read one chapter, not the shelf. While you read, write the keylang sentences in the margin: who needs whom, which of those needs would you `deny`, where would `entry` be. If you cannot answer, you read a story and did not yet see a structure.

### 8. Drawings that are not a keylang file

Two free conventions stop you from asking the map to do every job.

**C4**, Simon Brown, [c4model.com](https://c4model.com/). The site source is [github.com/simonbrowndotje/c4model](https://github.com/simonbrowndotje/c4model). The site's own opening is the quote to keep: a hierarchical set of abstractions — software systems, containers, components, and code — and a diagram for each level, notation left open. Four levels of zoom: the system in the world, the containers you deploy, the components inside one container, the code. A keylang map is nearest the component and code levels of *one* repository. It is not a picture of your company, and it is not a deployment diagram. Brown's point is to stop using one tangled box-and-arrow drawing for all four questions.

**arc42**, Gernot Starke and Peter Hruschka, [arc42.org](https://arc42.org/). The template is Creative Commons Attribution-ShareAlike 4.0, described on [their license page](https://arc42.org/license/). The building-block view is the nearest cousin of a keylang map. The runtime view is the nearest cousin of a flow. Quality requirements and risks are the promises keylang does not store: "checkout responds in this time," "we accept this chance of data loss." Put those in prose or an ADR. Do not pretend a `deny` line says them.

## After the structure is dull

Only then is it worth reading about the running system.

- Google's *Site Reliability Engineering* and *The Site Reliability Workbook* are free to read from [sre.google/books](https://sre.google/books/). They are about operating a service: error budgets, incidents, being up. They assume a system already has a shape.
- *Building Secure and Reliable Systems* (Adkins, Beyer, Blankinship, Lewandowski, Oprea, Stubblefield, O'Reilly, 2020) is free to read at [sre.google/books](https://sre.google/books/) and in [google.github.io/building-secure-and-reliable-systems](https://google.github.io/building-secure-and-reliable-systems/). The design chapters (understandability, least privilege, resilience) are the bridge from "the domain does not import the driver" to "the process does not have a privilege it does not need." keylang will not see a privilege. You still have to decide it.
- Martin Fowler's [catalog of *Patterns of Enterprise Application Architecture*](https://martinfowler.com/eaaCatalog/) (the book is Addison-Wesley, 2002; the catalog entries are on his site) is the dictionary for repository, service layer, and unit of work once cosmicpython has made those words concrete.
- *Designing Data-Intensive Applications* (Kleppmann, O'Reilly) is the book for when the pain is replication, consistency, and derived data, not folders. The author's site is [dataintensive.net](https://dataintensive.net/). Do not start there.
- *Release It!* (Nygard, Pragmatic Bookshelf) is the book for timeouts, retries, and not letting one slow dependency sink the process. Same advice: not first.

## What not to do in the first month

- Do not collect PDFs. A chapter you cannot point to in the author's own edition will not become a habit.
- Do not start with microservices, event sourcing, or CQRS. Cosmicpython part 2 is good, and it is part 2.
- Do not invent a layer because a book had a box with that label. Invent a layer when you can say its job, then write the `deny` that job requires.
- Do not expect keylang to check reliability of the running shop. It checks the sentences about who may know whom, and the steps of a scenario you named. The rest of "reliable" is tests, review, and the books in the previous section.

When the shop's wrong id, the `deny`, and one checkout flow are boring, go to [lesson 1](../01-what-it-is.md) and run them.
