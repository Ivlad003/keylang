# 2. The words

[Pre-course](README.md) · **English** · [Українською](uk/02-the-words.md)

The keywords you type are English, because that is the language keylang is written in. The ideas behind them come from the shop in [part 1](01-the-shop.md). If a word is not on this page, you do not need it to get started.

## The pieces

**Layer.** A named group of code with one job. In the shop the layers are `domain`, `application`, `presentation` and `infrastructure`. You choose the names yourself in `keylang.json`, because the tool cannot invent the jobs for you.

**Module.** One piece inside a layer that you can point at, such as `purchase` or `orderAggregate`. A module is usually one file, but it can also be a folder if the config says so.

**Function (`fn`).** A named action, such as `buy`, `create` or `save`.

**Type (`type`).** A named kind of value. In the shop, `OutOfStock` is a type declared on `purchase`. You can mention it in a scenario without learning anything about type systems.

**Id.** The dotted name that goes from the layer down, for example `application.purchase.buy`. Specs refer to code by ids rather than line numbers, so adding a blank line to the code does not change an id. A rename does change it, and then you update the spec on purpose.

**Alias.** A local nickname. Inside `purchase`, the line `order domain.orderAggregate` means "here I call it `order`, and I mean `domain.orderAggregate`." The nickname exists for the reader's convenience; the id is what actually points at the code.

## Three documents

Keep these three apart. When people mix them up, that is usually why the tool feels fussy.

**Map.** A picture of the code as it is today: layers, modules, functions, and the needs the tool was able to see. `keylang map` writes it, and you do not edit it by hand, because the next generation would overwrite your edit. If a file has lost its "generated" mark, the tool refuses to write over it. Remember that the map is a drawing, not a promise.

**Rules.** The promise, written by a person — for example, "the order's rules do not need the database." The code can break a promise, and catching that is exactly what the check is for. The map, by contrast, cannot break itself, because it was drawn from the code.

**Flow.** One scenario, also written by a person, as a short list of ids. You can add a paragraph of explanation, but that is for people to read; the tool does not judge it. Here is the shop's checkout:

1. It starts at the terminal. That starting point is the **trigger**.
2. The terminal's checkout needs `application.purchase.buy`. That is a **step**.
3. Inside `buy`, the order is created and then saved. A step *under* another step means "this happens inside the parent," while two steps at the same indent mean "this, then that."

A flow is one path through the program that you could tell a colleague about. It does not try to describe the whole shop.

## The promises you will write

**`layers a < b`.** Read `<` as "is below." `domain < application` means the domain sits underneath, so application may need the domain, but the domain may not need application. In other words, need points **down**. In the shop the line is `domain < application < presentation`: the screen may need the task, the task may need the order, and the order may not need the screen.

**A layer off to the side.** `infrastructure` is written *under* the `layers` line rather than inside the `<` chain, so it is not part of the up/down line. Need *into* it is free unless you forbid it. Need *out* of it, into a group that is in the line, requires an explicit permission. The shop gives such a permission, because the server lives in infrastructure and is handed the API, which belongs to presentation. That permission is written as an **`allow`**.

**`deny`.** A sentence that should fail the build when the code breaks it. `deny domain infrastructure` means "the order's rules must not need the database, the logger, or anything else in that group." A green result means the tool looked at the needs it could see and found no forbidden one. It does not mean "I proved there is no I/O anywhere."

**`allow`.** A permission for a need that the up/down line would otherwise reject. Write down the exception you actually mean, because exceptions that nobody wrote down are how the line quietly stops meaning anything.

**`entry`.** A place where a running program may start: the server, the terminal, a worker. Code that cannot be reached from any of these starting points is worth seeing, so the tool warns you about it. The warning alone does not fail the run.

**`exports`.** The public names of one module, for example "people outside `purchase` may call `buy` and `cancel`." An extra public function, or a listed name that is not actually public, breaks this promise.

**Cycle.** A needs B and B needs A, possibly through a longer loop. When that happens, neither piece can be understood on its own. `no-cycles` says that you do not want such a loop among the modules you named.

**`planned`.** A name you mean to use although its code is not written yet. `planned fn application.purchase.refund …` means "refund will exist; this is not a typo." A reference to a planned name counts as unfinished work, not as a failure. Once the function appears in the code, the tool tells you that the `planned` line can be removed.

## Three answers

Every check answers each claim with one of three words.

| Answer | Plain speech |
|---|---|
| `ok` | We looked where the claim applies, and it holds |
| `fail` | We looked, and it does not hold: a wrong id, a need that points the wrong way, or a need you denied |
| `unverified` | We could not look well enough to say. It is neither a pass nor a failure |

`unverified` protects you from a false sense of safety. The shop example has no source code next to the Markdown, so promises about real imports cannot be checked there. In that case the tool says `no snapshot` instead of pretending that the rules passed. A **snapshot** is the tool's look at the code at one moment; with no code, there is nothing to look at.

A run can finish with exit code 0 while some claims are still `unverified`. Exit code 0 means "nothing we were able to check is broken," not "everything is proved." The main course shows the `--strict` flag, which turns "we could not look" into a failed run. You do not need the flag yet, but do stop reading a quiet result as proof.

## Words that can wait

| Word | One line |
|---|---|
| Edge | One observed need: an import, a call, a type mention, or a re-export |
| Coverage | Places the look could not see. A hole there turns a promise into `unverified` |
| Gutter | The marks beside a line in the terminal. `✓` appears only when every answer on that line is `ok` |
| Wiring | An optional generated function that builds objects in order. It does not replace the rules |
| Proposal | Text an agent wants to add to a spec. It is not part of the spec until a person accepts it |
| Baseline | The deny frame `init` writes from today's dependencies. A later import across a gap fails until you allow it or regenerate |
| Feature | A file you write that says when a piece of work is done. The agent generates the functions |
| Explained map | The same map with a short note under each node. The check does not read it |

Next: [the principles](03-principles.md).
