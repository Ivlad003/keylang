# 3. The principles

[Pre-course](README.md) · **English** · [Українською](uk/03-principles.md)

These are the decisions the shop forces. They are also the only architecture principles you need in order to write keylang. Each one is something you can check on a repository you already have. None of them asks you to redraw the system in a notation you do not use.

## 1. A layer is a sentence, not a folder

Before you add a name to `keylang.json`, say the job out loud in one sentence, the way [part 1](01-the-shop.md) does for the shop. If the sentence is "miscellaneous" or "stuff the last feature needed," do not make it a layer yet. Put the code in the group whose sentence it actually serves.

The tool will accept any names. A bad sentence still produces a map. It just will not help you decide a `deny`.

## 2. Read every need as a sentence with a direction

"A needs B" is the only shape. When you are unsure, point with your finger from the file that imports to the file that is imported, and say the sentence. Then ask whether the job of A is allowed to know the job of B.

In the shop, `purchase` needs the order. Good: the task is allowed to know the rule. The order needs the database. Bad: the paper rule would know about the disk. `deny domain infrastructure` is that second sentence, written so a later import fails the check.

## 3. The center does not know the edges

Pick a center: the part that should still make sense if you describe it without a screen and without a database. In the shop the center is `domain`. The edges are `presentation` and `infrastructure`.

Edges may know the center. The screen may call `buy`. The store may save an order. The center does not know the edges. That single habit is what `layers a < b` encodes. `a` is the center side. `b` is further out. Need points down, toward the center.

This is a decision about *knowledge*, not about which code runs first. The server starts first and still sits at the edge. Startup order is `entry`. Knowledge direction is `layers`.

The four names in the shop are a useful cut, not a law. A 2005 workshop Martin Fowler recorded rejected "there are always exactly three layers" (3 votes for, 9 against) while strongly agreeing that the user interface holds no business rule and that a lower layer does not depend on an upper one. Cockburn's ports-and-adapters picture puts the database *outside*, beside the screen, rather than underneath the domain. That is why the shop writes `infrastructure` next to the `<` chain instead of under `domain`. The sources, and where they disagree, are in [part 4](04-reading.md).

## 4. An exception is a line, or it is an accident

Sometimes an edge must know another edge. In the shop the server is infrastructure and it is given `presentation.api`. The up/down line would reject that. The example writes `allow infrastructure presentation` and a sentence for the human reader: the server is handed the API.

Write the exception down. An `allow` you can explain is a decision. A quiet import in the opposite direction, with no `allow` and no `deny`, is how a layer stops meaning anything. Six months later nobody remembers why the order module opens a network connection.

Prefer a few `deny` lines at the layer level over a `deny` for every pair of files. You are recording the sentences from part 1, not drawing every arrow by hand.

## 5. A cycle means two jobs have collapsed

If A needs B and B needs A, you cannot understand either job alone, and you cannot change one without the other in your head. `no-cycles` records that you do not want this for the modules you care about.

Do not turn it on for the whole repository as a ritual. Turn it on where you mean the sentence "these pieces are separable." A cycle the tool reports is a question: which of the two needs is the accident?

## 6. A name in a spec is a finger pointing at code

Ids are how the promise stays attached to the program. `application.purchase.buy` survives a blank line. It does not survive a rename, and it should not: the promise has to be updated in the same change as the rename.

A name that points nowhere is a failure (`fail`), the `domain.aggregate` mistake. A name you have decided but not built is `planned`, and the answer stays `unverified` until the code exists. Use `planned` when you mean it. Do not use it to silence a typo.

## 7. Keep the picture and the promise in different files

The map is the picture. The tool draws it from the code. Rules and flows are the promise. You write them.

If you only have the picture, you have a table of contents. Nothing can be "wrong," because the picture follows the code, including the code you regret. If you only have the promise, you can say what you wanted, and you cannot see whether today's code still matches. keylang keeps both, and the check compares the promise to a fresh look at the code rather than to yesterday's picture.

Do not edit the picture to make the promise look true. Edit the code, or edit the promise.

## 8. A flow is one story you can tell without notes

Checkout is a flow because you can say it in order: the terminal starts, `buy` runs, the order is created, the order is saved, and if the item is missing the result is `OutOfStock`.

If you cannot tell the scenario in that shape, you are not ready to write the flow. Write the rules first. A flow of every function in the repository is a second map. It will rot, and it will teach you nothing.

The paragraph under a flow is for a person. The bullets are for the check. The tool does not grade your prose.

## 9. Trust the middle answer

`ok` and `fail` are easy to respect. `unverified` is the one that makes the tool safe to believe.

When the look at the code has a hole — no source files, an import it could not resolve, a call through a value it cannot name — the promise over that area stays `unverified`. The tool refuses to upgrade a hole into a pass. Read a quiet exit code the same way: nothing checked is broken. Something may still be unseen.

You will see this immediately on `examples/shop`. The wrong id fails. The rules cannot be proved, because there is no code to look at. Both facts are true at once.

## 10. Start from one pain, not from a diagram

A useful first spec is small:

- the layers you can already say in a sentence,
- one or two `deny` lines for the needs that have already bitten you,
- the real starting points as `entry`,
- one flow for the one scenario a new person asks about.

Add the next promise when a change hurts. A complete drawing of a system you do not yet understand is harder to maintain than the code.

## What this does not decide

keylang will not choose your layers for you. It will not tell you whether the shop should be four groups or three. It will not judge whether `buy` does the right arithmetic. It will not replace tests, review, or a typechecker.

It will hold still the sentences you were willing to write, and it will fail when the code stops matching them.

## You are ready for the course when

- You can point at a layer in a repository you know and say its job in one sentence.
- You can point at one import and say "A needs B," and say whether that direction is acceptable.
- You can tell one scenario as a trigger and a few steps, using names that exist.
- You can hear `unverified` and not translate it as "passed."

Then open [lesson 1](../01-what-it-is.md). Lesson 2 runs the shop check. Lesson 3 is the grammar for the words in [part 2](02-the-words.md). Stay in the shop example until those three lessons are familiar. The tool's own repository is a larger example of the same principles, not a different theory.
