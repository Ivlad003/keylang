# Adding to a codebase

[Course](../README.md) · **English** · [Українською](uk/README.md)

![Ключ до розробки і розуміння проектів](../images/banner.png)

The repository already exists. You need to add a feature, or plug in a library, without the new code reaching into the wrong place.

You write the spec for the feature. An agent generates the code from it. You do not write the functions. keylang does not start the agent. It checks that the new code stays inside the rules.

If `check` is new, read [lesson 2](../02-install-and-check.md) first. If the words layer and deny are new, the [pre-course](../pre/README.md) is the shop, with no commands.

| Part | You will be able to |
|---|---|
| [1. The first hour](01-the-first-hour.md) | Point keylang at the repo and keep two or three rules |
| [2. A new feature](02-a-feature.md) | Say what is not written yet, and know when it is done |
| [3. An integration](03-an-integration.md) | Add a package without letting the core import it |

The examples continue the shop. Checkout is already in the spec. You add a refund, then card payments.
