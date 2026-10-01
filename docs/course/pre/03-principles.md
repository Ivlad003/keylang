# 3. The principles

[Pre-course](README.md) · **English** · [Українською](uk/03-principles.md)

These are the decisions the shop forces. They are also enough to write keylang. Each one you can check on a repository you already have.

## 1. A layer is a sentence, not a folder

Before you add a name to `keylang.json`, say the job in one sentence, the way [part 1](01-the-shop.md) does. If the sentence is "miscellaneous," do not make it a layer yet. Put the code in the group whose sentence it serves.

The tool accepts any names. A bad sentence still produces a map. It will not help you decide a `deny`.

## 2. Every need is a sentence with a direction

"A needs B" is the only shape. Point from the file that imports to the file that is imported, and say the sentence. Then ask whether A's job may know B's job.

In the shop, `purchase` needs the order. Good: the task may know the rule. The order needs the database. Bad: the paper rule would know about the disk. `deny domain infrastructure` is that second sentence, written so a later import fails the check.

## 3. The center does not know the edges

Pick a center: the part that still makes sense with no screen and no database. In the shop the center is `domain`. The edges are `presentation` and `infrastructure`.

Edges may know the center. The screen may call `buy`. The store may save an order. The center does not know the edges. That habit is what `layers a < b` encodes. `a` is the center side. `b` is further out. Need points down, toward the center.

This is about *knowledge*, not about which code runs first. The server starts first and still sits at the edge. Startup order is `entry`. Knowledge direction is `layers`.

The shop's four names are a useful cut, not a law. A 2005 workshop Martin Fowler recorded rejected "there are always exactly three layers" (3 votes for, 9 against). The same room strongly agreed that the user interface holds no business rule, and that a lower layer does not depend on an upper one. Cockburn puts the database *outside*, beside the screen, not underneath the domain. That is why the shop writes `infrastructure` next to the `<` chain, not under `domain`. The sources are in [part 4](04-reading.md).

## 4. An exception is a line, or it is an accident

Sometimes an edge must know another edge. In the shop the server is infrastructure and it is given `presentation.api`. The up/down line would reject that. The example writes `allow infrastructure presentation` and a sentence for the reader.

Write the exception down. An `allow` you can explain is a decision. A quiet import the other way, with no `allow` and no `deny`, is how a layer stops meaning anything.

Prefer a few `deny` lines at the layer level. You are recording the sentences from part 1, not drawing every arrow.

## 5. A cycle means two jobs have collapsed

If A needs B and B needs A, you cannot understand either job alone. `no-cycles` records that you do not want this for the modules you care about.

Do not turn it on for the whole repository as a ritual. Turn it on where you mean "these pieces are separable." A reported cycle is a question: which of the two needs is the accident?

## 6. A name in a spec is a finger pointing at code

`application.purchase.buy` survives a blank line. It does not survive a rename, and it should not. The promise is updated in the same change as the rename.

A name that points nowhere is a failure (`fail`), the `domain.aggregate` mistake. A name you decided but have not built is `planned`. The answer stays `unverified` until the code exists. Use `planned` when you mean it. Do not use it to hide a typo.

## 7. Keep the picture and the promise in different files

The map is the picture. The tool draws it from the code. Rules and flows are the promise. You write them. The agent writes the functions. You do not.

A picture alone is a table of contents. Nothing can be wrong, because the picture follows the code, including the code you regret. A promise alone says what you wanted, and cannot see whether today's code still matches. The check compares the promise to a fresh look at the code, not to yesterday's picture.

Do not edit the picture to make the promise look true. The agent changes the code from the spec. You change the promise.

## 8. A flow is one story you can tell without notes

Checkout is a flow because you can say it in order: the terminal starts, `buy` runs, the order is created, the order is saved, and if the item is missing the result is `OutOfStock`.

If you cannot tell it that way, write the rules first. A flow of every function is a second map. It will rot.

The paragraph under a flow is for a person. The bullets are for the check. The tool does not grade your prose.

## 9. Trust the middle answer

`ok` and `fail` are easy to respect. `unverified` is what makes the tool safe to believe.

When the look at the code has a hole — no source files, an import it could not resolve, a call through a value it cannot name — the promise over that area stays `unverified`. The tool will not turn a hole into a pass. A quiet exit code means the same thing: nothing checked is broken. Something may still be unseen.

You see this on `examples/shop`. The wrong id fails. The rules cannot be proved, because there is no code to look at. Both facts are true at once.

## 10. Start from one pain, not from a diagram

A useful first spec is small:

- the layers you can already say in a sentence,
- one or two `deny` lines for the needs that have already bitten you,
- the real starting points as `entry`,
- one flow for the scenario a new person asks about.

Add the next promise when a change hurts.

## What this does not decide

keylang will not choose your layers. It will not tell you whether the shop should be four groups or three. It will not judge whether `buy` does the right arithmetic. It will not replace tests, review, or a typechecker.

It holds the sentences you were willing to write, and it fails when the code stops matching them.

## You are ready when

- You can point at a layer and say its job in one sentence.
- You can point at one import and say "A needs B," and say whether that direction is acceptable.
- You can tell one scenario as a trigger and a few steps, using names that exist.
- You can hear `unverified` and not hear "passed."

Then open [lesson 1](../01-what-it-is.md). Lesson 2 runs the shop check. Lesson 3 is the grammar for the words in [part 2](02-the-words.md). Stay with the shop until those three lessons feel familiar.
