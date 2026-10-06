# 3. The principles

[Pre-course](README.md) · **English** · [Українською](uk/03-principles.md)

These are the decisions the shop forces on you, and together they are enough to start writing keylang. You do not have to take any of them on faith: each one can be checked on a repository you already have.

## 1. A layer is a sentence, not a folder

Before you add a name to `keylang.json`, say the layer's job in one sentence, the way [part 1](01-the-shop.md) does. If the best sentence you can find is "miscellaneous," do not make it a layer yet; instead, put the code into the group whose sentence it actually serves.

The tool accepts any names, so a bad sentence will still produce a map. What it will not do is help you decide a `deny`, because you cannot say what a "miscellaneous" layer should be forbidden to know.

## 2. Every need is a sentence with a direction

"A needs B" is the only shape a need takes. Point from the file that imports to the file that is imported, say the sentence out loud, and then ask whether A's job is allowed to know about B's job.

In the shop, `purchase` needs the order, and that is fine: the task may know the rule it applies. Now suppose the order needed the database. That would be bad, because the rule that is true even on paper would then know about the disk. `deny domain infrastructure` is that second sentence written down, so that if someone adds such an import later, the check fails.

## 3. The center does not know the edges

Pick a center: the part that still makes sense with no screen and no database. In the shop the center is `domain`, and the edges are `presentation` and `infrastructure`.

Edges may know the center, so the screen may call `buy` and the store may save an order. The center, however, does not know the edges. That habit is exactly what `layers a < b` encodes: `a` is the side closer to the center, `b` is further out, and a need always points down, toward the center.

This is about *knowledge*, not about which code runs first. The server starts first, yet it still sits at the edge. Startup order is what `entry` describes; the direction of knowledge is what `layers` describes.

The shop's four names are a useful cut, not a law. At a 2005 workshop that Martin Fowler recorded, the room rejected "there are at least three main layer types" (3 votes for, 9 against). The same room agreed, without a single vote against, that the user interface holds no business rule and that a lower layer does not depend on an upper one. Cockburn goes further and puts the database *outside*, beside the screen, rather than underneath the domain. That is why the shop writes `infrastructure` next to the `<` chain instead of under `domain`. The sources are collected in [part 4](04-reading.md).

## 4. An exception is a line, or it is an accident

Sometimes one edge has to know another edge. In the shop the server belongs to infrastructure, yet it is handed `presentation.api`, which the up/down line would reject. So the example writes `allow infrastructure presentation`, together with a sentence that explains the choice to the reader.

Always write the exception down. An `allow` you can explain is a decision. A quiet import in the other direction, with no `allow` and no `deny`, is how a layer gradually stops meaning anything.

Prefer a few `deny` lines at the layer level. You are recording the sentences from part 1, not drawing every arrow in the program.

## 5. A cycle means two jobs have collapsed

If A needs B and B also needs A, you can no longer understand either job on its own. `no-cycles` records that you do not want this to happen in the modules you care about.

Do not turn it on for the whole repository as a ritual. Turn it on where you really mean "these pieces can be separated." When the tool reports a cycle, treat it as a question: which of the two needs is the accident?

## 6. A name in a spec is a finger pointing at code

`application.purchase.buy` survives a blank line being added nearby, but it does not survive a rename, and it should not. When you rename the code, the promise is updated in the same change.

A name that points nowhere is a failure (`fail`); that is the `domain.aggregate` mistake from the shop. A name you have decided on but not built yet is `planned`, and the answer for it stays `unverified` until the code exists. Use `planned` only when you mean it, and never to hide a typo.

## 7. Keep the picture and the promise in different files

The map is the picture, and the tool draws it from the code. Rules and flows are the promise, and you write them. The functions are written by the agent, not by you.

A picture on its own is just a table of contents. Nothing in it can be wrong, because the picture follows the code, including the code you regret. A promise on its own says what you wanted but cannot see whether today's code still matches it. That is why the check compares the promise with a fresh look at the code, not with yesterday's picture.

Do not edit the picture to make the promise look true. The agent changes the code according to the spec, and you change the promise.

## 8. A flow is one story you can tell without notes

Checkout is a flow because you can tell it in order: the terminal starts, `buy` runs, the order is created, the order is saved, and if the item is missing, the result is `OutOfStock`.

If you cannot tell a scenario that way, write the rules first. A flow that lists every function is just a second map, and it will rot.

The paragraph under a flow is written for a person, while the bullets are written for the check. The tool does not grade your prose.

## 9. Trust the middle answer

`ok` and `fail` are easy to respect. It is `unverified` that makes the tool safe to believe.

When the look at the code has a hole in it — there are no source files, an import could not be resolved, or a call goes through a value the tool cannot name — every promise about that area stays `unverified`. The tool will never turn a hole into a pass. A quiet exit code means the same thing: nothing that was checked is broken, but something may still be unseen.

You can see this on `examples/shop`. The wrong id fails, while the rules cannot be proved because there is no code to look at. Both facts are true at the same time.

## 10. Start from one pain, not from a diagram

A useful first spec is small:

- the layers you can already describe in a sentence,
- one or two `deny` lines for the needs that have already bitten you,
- the real starting points as `entry`,
- one flow for the scenario a new person on the team asks about.

Add the next promise when a change starts to hurt.

## What this does not decide

keylang will not choose your layers for you, and it will not tell you whether the shop should have four groups or three. It will not judge whether `buy` does the right arithmetic, and it will not replace tests, review, or a typechecker.

What it does is hold the sentences you were willing to write down, and fail when the code stops matching them.

## You are ready when

- You can point at a layer and say its job in one sentence.
- You can point at one import, say "A needs B," and say whether that direction is acceptable.
- You can tell one scenario as a trigger followed by a few steps, using names that actually exist.
- You can hear `unverified` without hearing "passed."

Then open [lesson 1](../01-what-it-is.md). Lesson 2 runs the check on the shop, and lesson 3 gives the grammar for the words from [part 2](02-the-words.md). Stay with the shop until those three lessons feel familiar.
