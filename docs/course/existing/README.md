# Adding to a codebase

[Course](../README.md) · **English** · [Українською](uk/README.md)

![Ключ до розробки і розуміння проєктів](../images/banner.png)

This track is for a repository that already exists. You need to add a feature or plug in a library, and you want the new code to stay out of places it should not touch.

You write the spec for the feature, and an agent generates the code from it, so you do not write the functions yourself. keylang does not start the agent. It checks that the new code stays inside the rules.

If `check` is new to you, read [lesson 2](../02-install-and-check.md) first. If the words layer and deny are new, start with the [pre-course](../pre/README.md), which explains them through the shop without a single command.

| Part | You will be able to |
|---|---|
| [1. The first hour](01-the-first-hour.md) | Point keylang at the repo and keep two or three rules |
| [2. A new feature](02-a-feature.md) | Describe what is not written yet, and know when it is done |
| [3. An integration](03-an-integration.md) | Add a package without letting the core import it |

The examples continue the shop. Checkout is already in the spec, and you add two things on top of it: a refund first, then card payments.
