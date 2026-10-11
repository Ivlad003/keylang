# 3. The principles

[Pre-course](README.md) · **English** · [Українською](uk/03-principles.md)

The words from part 2 are only useful once you decide something with them. These are the decisions the shop forces on you, and they are enough to start writing keylang. You do not have to take any of them on faith: you can test each one on a repository you already have.

## 1. A layer is a sentence, not a folder

Before you add a name to `keylang.json`, say the layer's job in one sentence, the way [part 1](01-the-shop.md) does. If the best sentence you can find is "miscellaneous," do not make it a layer yet. Put the code into the group whose sentence it actually serves.

The tool accepts any names, so a bad sentence still produces a map. It just cannot help you write a `deny`, because nobody can say what a "miscellaneous" layer should be forbidden to know.

## 2. Every need is a sentence with a direction

"A needs B" is the only shape a need takes. Point from the file that imports to the file that is imported, say the sentence out loud, and then ask whether A's job is allowed to know about B's job.

In the shop, `purchase` needs the order, and that is fine: the task may know the rule it applies. Now suppose the order needed the database. That would be bad, because the rule that is true even on paper would then know about the disk. `deny domain infrastructure` writes that second sentence down, so the check fails if someone adds such an import later.

## 3. The center does not know the edges

Pick a center: the part that still makes sense with no screen and no database. In the shop the center is `domain`, and the edges are `presentation` and `infrastructure`.

Edges may know the center: the screen may call `buy`, and the store may save an order. The center does not know the edges. `layers a < b` encodes exactly that: `a` is closer to the center, `b` is further out, and a need always points down, toward the center.

This is about *knowledge*, not about which code runs first. The server starts first, yet it still sits at the edge. `entry` describes where the program starts; `layers` describes the direction of knowledge.

The shop's four names are a useful cut, not a law. At a 2005 workshop that Martin Fowler recorded, the room rejected "there are at least three main layer types" (3 votes for, 9 against). The same room agreed, without a single vote against, that the user interface holds no business rule and that a lower layer does not depend on an upper one. Cockburn goes further and puts the database *outside*, beside the screen, rather than underneath the domain. That is why the shop writes `infrastructure` next to the `<` chain instead of under `domain`. The sources are collected in [part 4](04-reading.md).

## 4. An exception is a line, or it is an accident

Sometimes one edge has to know another. In the shop the server belongs to infrastructure, yet it is handed `presentation.api`, which the up/down line would reject. So the example writes `allow infrastructure presentation`, with a sentence that explains the choice to the reader.

Always write the exception down. An `allow` you can explain is a decision. A quiet import in the other direction, with no `allow` and no `deny`, is how a layer gradually stops meaning anything.

Prefer a few `deny` lines at the layer level. You are writing down the sentences from part 1, not drawing every arrow in the program.

## 5. A cycle means two jobs have collapsed

If A needs B and B also needs A, you can no longer understand either job on its own. `no-cycles` says you do not want that in the modules you care about.

Do not turn it on for the whole repository out of habit. Turn it on where you really mean "these pieces can be separated." When the tool reports a cycle, treat it as a question: which of the two needs is the accident?

## 6. A name in a spec is a finger pointing at code

`application.purchase.buy` survives a blank line added nearby. It does not survive a rename, and it should not: when you rename the code, you update the promise in the same change.

A name that points nowhere is a failure (`fail`); that is the `domain.aggregate` mistake from the shop. A name you have decided on but not built yet is `planned`, and the answer for it stays `unverified` until the code exists. Use `planned` only when you mean it, and never to hide a typo.

## 7. Keep the picture and the promise in different files

The map is the picture, and the tool draws it from the code. Rules and flows are the promise, and you write them. The agent writes the functions.

A picture on its own is a table of contents. Nothing in it can be wrong, because it follows the code, including the code you regret. A promise on its own says what you wanted but cannot see whether today's code still matches. So the check compares the promise with a fresh look at the code, not with yesterday's picture.

Do not edit the picture to make the promise look true. The agent changes the code according to the spec, and you change the promise.

## 8. A flow is one story you can tell without notes

Checkout is a flow because you can tell it in order: the terminal starts, `buy` runs, the order is created, the order is saved, and if the item is missing, the result is `OutOfStock`.

If you cannot tell a scenario that way, write the rules first. A flow that lists every function is just a second map, and it will rot.

The paragraph under a flow is for a person, and the bullets are for the check. The tool does not grade your prose.

## 9. Trust the middle answer

`ok` and `fail` are easy to respect. `unverified` is what makes the tool safe to believe.

The look at the code can have a hole in it: there are no source files, an import could not be resolved, or a call goes through a value the tool cannot name. Every promise about that area then stays `unverified`. The tool never turns a hole into a pass. A quiet exit code means the same thing: nothing that was checked is broken, but something may still be unseen.

You can see this on `examples/shop`. The wrong id fails, and the rules cannot be proved because there is no code to look at. Both are true at once.

## 10. Start from one pain, not from a diagram

A useful first spec is small:

- the layers you can already describe in a sentence,
- one or two `deny` lines for the needs that have already bitten you,
- the real starting points as `entry`,
- one flow for the scenario a new person on the team asks about.

Add the next promise when a change starts to hurt.

## What this does not decide

keylang will not choose your layers or tell you whether the shop should have four groups or three. It will not judge whether `buy` does the right arithmetic, and it does not replace tests, review, or a typechecker.

It holds the sentences you were willing to write down, and it fails when the code stops matching them.

## You are ready when

- You can point at a layer and say its job in one sentence.
- You can point at one import, say "A needs B," and say whether that direction is acceptable.
- You can tell one scenario as a trigger followed by a few steps, using names that actually exist.
- You can hear `unverified` without hearing "passed."

Then open [lesson 1](../01-what-it-is.md). Lesson 2 runs the check on the shop, and lesson 3 gives the grammar for the words from [part 2](02-the-words.md). Stay with the shop until those three lessons feel familiar.
