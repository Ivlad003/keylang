# 2. The words

[Pre-course](README.md) · **English** · [Українською](uk/02-the-words.md)

The words you type are English, because that is the language. The ideas are the shop from [part 1](01-the-shop.md). If a word is not here, you do not need it to start.

## The pieces

**Layer.** A named group with one job. In the shop: `domain`, `application`, `presentation`, `infrastructure`. You choose the names in `keylang.json`. The tool does not invent the jobs.

**Module.** One piece inside a layer you can point at. `purchase` is a module. `orderAggregate` is a module. A module is usually one file. It can be a folder, if the config says so.

**Function (`fn`).** A named action. `buy`, `create`, `save`.

**Type (`type`).** A named kind of value. In the shop, `OutOfStock` is a type on `purchase`. You can mention it in a scenario without learning a type system.

**Id.** The dotted name, from the layer down: `application.purchase.buy`. Specs use ids, not line numbers. A blank line does not change an id. A rename does, and then you update the spec on purpose.

**Alias.** A local nickname. Inside `purchase` the line `order domain.orderAggregate` means "here I call it `order`, and I mean `domain.orderAggregate`." The nickname is for the reader. The id is the real pointing.

## Three documents

Keep these apart. Mixing them up is why the tool feels fussy.

**Map.** A picture of the code today: layers, modules, functions, and the needs the tool could see. `keylang map` writes it. You do not edit it. The next generation would overwrite your edit. A file that lost its "generated" mark blocks the write. The picture is a drawing, not a promise.

**Rules.** The promise, written by a person. "The order's rules do not need the database." The code can break a promise. That is what the check is for. The map cannot break itself, because it was drawn from the code.

**Flow.** One scenario, also written by a person, as a short list of ids. A paragraph is for a person. The tool does not judge it. The shop's checkout:

1. It starts at the terminal. That start is the **trigger**.
2. The terminal's checkout needs `application.purchase.buy`. That is a **step**.
3. Inside `buy`, the order is created and then saved. A step *under* another step means "this happens inside the parent." Two steps at the same indent mean "this, then that."

A flow is one path you can tell a colleague. It is not the whole shop.

## The promises you will write

**`layers a < b`.** Read `<` as "is below." `domain < application` means the domain is underneath, and application may need the domain. The domain may not need application. Need points **down**. In the shop: `domain < application < presentation`. The screen may need the task. The task may need the order. The order may not need the screen.

**A layer off to the side.** `infrastructure` is written *under* the `layers` line, not inside the `<` chain. It is not in the up/down line. Need *into* it is free unless you forbid it. Need *out* of it, into a group that is in the line, needs an explicit permission. The shop gives that permission: the server lives in infrastructure and is handed the API, which is presentation. The permission is an **`allow`**.

**`deny`.** A sentence you want to fail the build. `deny domain infrastructure` means "the order's rules must not need the database, the logger, or anything else in that group." A green result means the tool looked at the needs it could see and found no forbidden one. It does not mean "I proved there is no I/O anywhere."

**`allow`.** A permission the up/down line would otherwise reject. Write the exception you mean. An exception you did not write down is how the line quietly dies.

**`entry`.** Where a running program may start: the server, the terminal, a worker. Code that nothing can reach from those starts is worth seeing. The tool warns. It does not fail the run for that warning.

**`exports`.** The public names of one module. "People outside `purchase` may call `buy` and `cancel`." An extra public function, or a listed name that is not public, breaks the promise.

**Cycle.** A needs B, and B needs A, maybe through a longer loop. Neither piece can be understood alone. `no-cycles` says you do not want that loop for the modules you named.

**`planned`.** A name you mean, and the code is not written yet. `planned fn application.purchase.refund …` means "refund will exist; this is not a typo." A reference to it is unfinished, not a failure. When the function appears, the tool says the `planned` line can go.

## Three answers

Every check answers one claim with one of three words.

| Answer | Plain speech |
|---|---|
| `ok` | We looked where the claim applies, and it holds |
| `fail` | We looked, and it does not hold. A wrong id. A need that points the wrong way. A need you denied |
| `unverified` | We did not look well enough to say. Not a pass, and not a failure |

`unverified` saves you from a false sense of safety. The shop example has no source code next to the Markdown, so the promises about real imports cannot be checked. The tool says `no snapshot` and does not pretend the rules passed. A **snapshot** is the tool's look at the code at one moment. No code, no look.

A run can finish with exit code 0 while some claims are `unverified`. Exit code 0 means "nothing we could check is broken." It does not mean "everything is proved." The main course shows `--strict`, which turns "we could not look" into a failed run. You do not need the flag yet. Stop reading a quiet result as a proof.

## Words that can wait

| Word | One line |
|---|---|
| Edge | One observed need: an import, a call, a type mention, or a re-export |
| Coverage | Places the look could not see. A hole there turns a promise into `unverified` |
| Gutter | The marks beside a line in the terminal. `✓` only when every answer on that line is `ok` |
| Wiring | An optional generated function that builds objects in order. It does not replace the rules |
| Proposal | Text an agent wants in a spec. It is not in the spec until a person accepts it |
| Baseline | The deny frame `init` writes from today's dependencies. A later import across a gap fails until you allow it or regenerate |
| Feature | A file that says when a piece of work is done |
| Explained map | The same map with a short note under each node. The check does not read it |

Next: [the principles](03-principles.md).
