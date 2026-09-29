# 2. The words

[Pre-course](README.md) · **English** · [Українською](uk/02-the-words.md)

The keywords you type are English, because that is the language. The ideas are the shop from [part 1](01-the-shop.md). If a word is not in this list, you do not need it to start. A short "later" list is at the bottom.

## The pieces

**Layer.** A named group with one job. In the shop: `domain`, `application`, `presentation`, `infrastructure`. You choose the names in `keylang.json`. The tool does not invent the jobs.

**Module.** One piece inside a layer that you can point at. `purchase` is a module. `orderAggregate` is a module. A module is usually one file. It can be a folder, if you say so in the config. You can ignore that choice until a repository forces it.

**Function (`fn`).** A named action inside a module. `buy`, `create`, `save`.

**Type (`type`).** A named kind of value the module declares. In the shop, `OutOfStock` is a type on `purchase`. You can mention it in a scenario ("when the item is missing, this happens") without learning a type system.

**Id.** The dotted name of a piece, from the layer down: `application.purchase.buy`. Specs use ids, not line numbers. A line number changes when someone adds a blank line. The id changes when you rename the module or move it to another layer, and then you update the spec on purpose.

**Alias.** A local nickname for a dependency. Inside `purchase` the line `order domain.orderAggregate` means "in this module I call it `order`, and I mean the module `domain.orderAggregate`." The nickname is for the reader of that module. The id after it is the real pointing.

## The three documents

Keep these apart. Mixing them up is the usual reason the tool feels fussy.

**Map.** A picture of what the code contains today: layers, modules, functions, and the dependencies the tool could see. `keylang map` writes it. You do not edit it by hand. The next generation would overwrite your edit, and a file that lost its "generated" mark blocks the write entirely. The picture is not a promise. It is a drawing of the code.

**Rules.** The promise, written by a person. "The order's rules do not need the database." "`buy` and `cancel` are the public actions of `purchase`." The code can violate a promise. That is what the check is for. The map cannot violate itself, because it was drawn from the code.

**Flow.** One scenario, also written by a person, as a short list of ids. Not a paragraph. A paragraph is for a human reader and the tool does not judge it. The list is the part that can be checked. The shop's scenario is checkout:

1. It starts at the terminal. That starting point is the **trigger**.
2. The terminal's checkout needs `application.purchase.buy`. That is a **step**.
3. Inside `buy`, the order is created and then saved. A step written *under* another step means "this happens inside the parent." Two steps at the same indent, one after the other, mean "this, then that."

A flow is one path you can tell to a colleague. It is not a description of the whole shop.

## The promises you will actually write

**`layers a < b`.** Read the `<` as "is below." `domain < application` means the domain is underneath, and application may need the domain. The domain may not need application. Need points **down**. In the shop the line is `domain < application < presentation`: the screen may need the task, the task may need the order, the order may not need the screen.

**A layer off to the side.** `infrastructure` is written *under* the `layers` line, not inside the `<` chain. That means "this group is not in the up/down line." Need *into* it is free unless you forbid it. Need *out* of it, into a group that is in the line, needs an explicit permission. The shop gives that permission: the server lives in infrastructure and is handed the API, which is presentation. The permission is an **`allow`**.

**`deny`.** A sentence you want to fail the build: `deny domain infrastructure` is "the order's rules must not need the database, the logger, or anything else in that group." A `deny` is the promise. A green result means the tool looked at the needs it could see and did not find a forbidden one. It does not mean "I proved there is no I/O anywhere."

**`allow`.** A permission that would otherwise be forbidden by the up/down line. Use it for an exception you mean. An exception you did not write down is how the up/down line quietly dies.

**`entry`.** Where a running program is allowed to start: the server, the terminal, a worker. Code that nothing can reach from those starts is not necessarily wrong, but it is worth seeing. The tool warns. It does not fail the run for that warning.

**`exports`.** The public names of one module. "People outside `purchase` may call `buy` and `cancel`." A extra public function, or a listed name that is not public, breaks the promise.

**Cycle.** A needs B, and B needs A, possibly through a longer loop. Neither piece can be understood alone. `no-cycles` says you do not want that loop for the modules you named. It is a promise about the import graph, not a moral rule you must apply to every repository on the first day.

**`planned`.** A name you mean, and the code is not written yet. `planned fn application.purchase.refund …` is "refund will exist; do not call this a typo." A reference to it is not a failure. It is unfinished. When the function appears for real, the tool tells you the `planned` line can go.

## The three answers

Every check answers one claim with one of three words. They are not a style. They are the whole point of trusting the result.

| Answer | Plain speech |
|---|---|
| `ok` | We looked where the claim applies, and it holds |
| `fail` | We looked, and it does not hold. A wrong id. A need that points the wrong way. A need you denied |
| `unverified` | We did not look well enough to say. Not a pass, and not a failure |

`unverified` is the word that saves you from a false sense of safety. The shop example has no source code next to the Markdown, so the promises about real imports cannot be checked. The tool says `no snapshot` and does not pretend the rules passed. A **snapshot** is simply the tool's look at the code at one moment. No code, no look.

A run can finish with exit code 0 while some claims are `unverified`. Exit code 0 means "nothing we could check is broken." It does not mean "everything is proved." The main course shows the flag (`--strict`) that turns "we could not look" into a failed run. You do not need the flag yet. You need to stop reading a quiet result as a proof.

## Words that can wait

You will meet these in the main course. Skipping them here will not make the shop harder.

| Word | One line, for when you see it |
|---|---|
| Snapshot | The look at the code that the map and the check share. Already introduced above |
| Edge | One observed need: an import, a call, a type mention, or a re-export. The check counts these, not your intention |
| Coverage | The list of places the look could not see into. A hole there turns a promise into `unverified` |
| Gutter | The column of marks beside a line in the terminal UI. `✓` only when every reported answer on that line is `ok` |
| Wiring | An optional generated function that builds the objects in a set order. It does not replace the rules |
| Proposal | Text an agent wants to put in a spec. It is not in the spec until a person accepts it |
| Baseline | The deny frame `init` writes from today's dependencies. A later import across a gap fails until you allow it or regenerate |
| Feature | A spec file that says when a piece of work is done: the planned ids are implemented, the steps are statically ok, and no rule fails |
| Explained map | The same map with a doc comment or a saved brief under each node. The check does not read it |

Next: [the principles](03-principles.md), which are the decisions hiding inside these words.
