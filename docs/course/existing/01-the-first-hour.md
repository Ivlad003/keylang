# 1. The first hour

[Adding to a codebase](README.md) · **English** · [Українською](uk/01-the-first-hour.md)

Do not redesign the repository on day one. Point the tool at it, read what it sees, and write down the few rules you are actually willing to keep. Those rules are the spec. The functions that appear later are written by the agent, not by you, and keylang does not start the agent: it only checks what comes out.

```sh
npx keylang init .
npx keylang map
npx keylang check
```

`init` guesses a layer from each folder that has source code; if `src/` or `lib/` exists, it takes the folders inside it instead. It then writes `keylang.json`, a generated map, and `keylang/rules.baseline.md`. The baseline denies the layer dependencies the code does not have yet, so a new one that appears later will be flagged. Read it before you move on. If a deny forbids a call you still need, that is a conversation to have, not a bug in the tool.

Open `keylang/map`. The id under each function is the name you will type later, so copy it from the map instead of inventing a shorter one.

Edit `keylang.json` only where the guess is wrong. One thing to know: a folder named `external` is renamed (`external_`), because that word is reserved. `init` prints the new name when it runs.

Then write the rules you actually mean in `keylang/rules.md`, separately from the baseline. Two or three lines are enough to start:

```markdown
# rules

- layers domain < application < presentation
  - infrastructure
- deny domain infrastructure
- deny domain external
```

`infrastructure` sits beside the chain rather than under `domain`. In the chain, the left side of `<` is the inner layer. The two deny lines mean that domain may import neither the database nor a package.

`keylang check` never writes files. Exit 0 means there is no blocking finding, and lines that are still `unverified` are allowed through. Exit 1 means a real break, or, if you ran `map --check`, a map that is out of date.

In CI, run both, so that broken rules and a stale map are both caught:

```sh
npx keylang check
npx keylang map --check
```

## Someone else's repository

To read a repository before you work in it, you do not need to clone it yourself or write anything into it. `keylang clone` makes a shallow clone in keylang's cache (`~/.cache/keylang/repos/<host>/<path>`), runs `init` there without agent files, and builds the map:

```sh
npx keylang clone https://github.com/owner/repo
npx keylang clone https://github.com/owner/repo --explain map-and-ai --dry-run
npx keylang clone https://github.com/owner/repo --explain map-and-ai
npx keylang web https://github.com/owner/repo
```

The first line of the output is where the clone lives; open its `keylang/map` like your own. Run the same command again to pick up new commits. `--explain map-and-ai` also asks the model for a short note on every node and writes `keylang/map-explained/`; `--explain all` adds a longer explanation of every layer. Both need a model in the environment, for example `KEYLANG_AGENT=cli:claude`, because the clone's `keylang.json` belongs to keylang. `--dry-run` prints the token estimate first and asks nothing. `web` with a URL does the clone and then opens the browser UI on it.

Inside the clone, `keylang tour` prints one page for a newcomer, with no model: what the system says it is, the layers with their size and coupling, the business processes and their flows (run `keylang flows discover` first, so each flow has its file and its diagram link), the entry points, the integrations, the blind spots that you have to read by hand, and the ten functions to start reading with. `keylang tour --out keylang/tour.md` keeps it as a generated file that `check` does not read, and the «Огляд» tab of `keylang web` shows the same page.

If a fence around the code was all you wanted, you can stop here. The next part is for a change that does not exist in the code yet.

Next: [a new feature](02-a-feature.md).
