# 1. The first hour

[Adding to a codebase](README.md) · **English** · [Українською](uk/01-the-first-hour.md)

Do not redesign the repository on day one. Point the tool at it, read what it sees, and write the few rules you are willing to keep. Those rules are the spec. The functions that appear later are the agent's. You do not write them. keylang does not start the agent.

```sh
npx keylang init .
npx keylang map
npx keylang check
```

`init` guesses a layer from each folder that has source. If `src/` or `lib/` exists, the guess is the folders inside it. It writes `keylang.json`, a generated map, and `keylang/rules.baseline.md`. The baseline denies layer dependencies the code does not have yet. Read it. A deny that forbids a call you still need is a conversation, not a bug in the tool.

Open `keylang/map`. The id under a function is the name you will type later. Copy it from the map. Do not invent a shorter one.

Fix `keylang.json` only where the guess is wrong. A folder named `external` is renamed (`external_`) because that word is reserved. The new name is printed when you init.

Then write the rules you mean, in `keylang/rules.md`, separate from the baseline. Two or three lines are enough:

```markdown
# rules

- layers domain < application < presentation
  - infrastructure
- deny domain infrastructure
- deny domain external
```

`infrastructure` sits beside the chain, not under `domain`. The left side of `<` is the inner one. Domain may not import the database or a package.

`keylang check` writes nothing. Exit 0 means no blocking finding. `unverified` is still allowed. Exit 1 is a real break, or a stale map if you ran `map --check`.

In CI, run both:

```sh
npx keylang check
npx keylang map --check
```

Stop here if a fence was all you wanted. The next part is for a change that does not exist in the code yet.

Next: [a new feature](02-a-feature.md).
