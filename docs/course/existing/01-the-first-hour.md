# 1. The first hour

[Adding to a codebase](README.md) · **English** · [Українською](uk/01-the-first-hour.md)

Do not redesign the repository on day one. Point the tool at it, read what it sees, and write down the few rules you are actually willing to keep. Those rules are the spec. The agent writes the functions that come later; keylang does not start the agent, it only checks what comes out.

```sh
npx keylang init .
npx keylang map
npx keylang check
```

`init` makes a layer of each folder that has source code; if `src/` or `lib/` exists, it uses the folders inside it instead. It then writes `keylang.json`, a generated map and `keylang/rules.baseline.md`. The baseline denies every layer dependency the code does not have yet, so keylang flags a new one the moment it appears. Read the baseline before you move on. If a deny forbids a call you still need, that is a conversation for the team, not a bug in the tool.

Next, open `keylang/map`. The id under each function is the name you will type later, so copy it from the map instead of inventing a shorter one.

Before you write a rule, ask the snapshot what it sees. None of these commands writes a spec, and `check` reads none of their output:

```sh
npx keylang flows discover
npx keylang tour
npx keylang entries
npx keylang coverage
```

Run `flows discover` first. It writes a draft flow for every entry point into `keylang/flows-discovered/`, a generated view, so that each flow on the tour has its own file and diagram link.

`tour` prints one page for a newcomer, without calling a model. It covers what the system says it is, the layers with their size and coupling, the business processes and their flows, the entry points, the integrations, the blind spots, and the ten functions to start reading with. `tour --out keylang/tour.md` keeps the page as a generated file, and the «Огляд» tab of `keylang web` shows the same page.

`entries` lists where execution starts: `bin` of `package.json`, a `main`, a route with a literal path, and the routes, cron jobs, consumers and observers of any framework keylang has an adapter for (Magento, Laravel, Symfony, NestJS, PWA Kit, SFCC, Django, FastAPI, Flask, Celery, Express, Fastify, Next.js). An adapter switches itself on when the repository shows signs of its framework, such as a manifest, an import or a config file. `frameworks` in `keylang.json` overrides that choice.

`coverage` shows where keylang is blind: functions no entry point reaches, the modules with the most holes, entry points without a flow, and settings that decide behavior in data.

Some discovered flow will be the scenario every newcomer asks about. Keep that one: `npx keylang flows adopt <name>` proposes it as `keylang/flows/<name>.md`, and you accept it with `npx keylang proposals accept keylang/flows/<name>.md`. From then on `check` holds it like a flow you wrote.

Edit `keylang.json` only where the guess is wrong. `init` renames a folder called `external` to `external_`, because that word is reserved, and prints the new name when it runs.

With the picture in hand, write the rules you actually mean in `keylang/rules.md`, separately from the baseline. Two or three lines are enough to start:

```markdown
# rules

- layers domain < application < presentation
  - infrastructure
- deny domain infrastructure
- deny domain external
```

In the chain, the left side of `<` is the inner layer. `infrastructure` sits beside the chain rather than under `domain`. The two deny lines say that domain may import neither the database nor a package. A dependency from the side layer into the chain is K101 until you write it down: if the store saves the domain's objects, add `- allow infrastructure domain` with a sentence that says why.

`keylang check` never writes files. Exit 0 means there is no blocking finding; lines that are still `unverified` pass. Exit 1 means a real break, or, if you ran `map --check`, a map that is out of date.

Run both in CI, so that a broken rule and a stale map each fail the build:

```sh
npx keylang check
npx keylang map --check
```

## Someone else's repository

Sometimes the repository is not yours, and you only want to read it before you work in it. You do not need to clone it yourself or write anything into it: `keylang clone` makes a shallow clone in keylang's cache (`~/.cache/keylang/repos/<host>/<path>`), runs `init` there without agent files, and builds the map:

```sh
npx keylang clone https://github.com/owner/repo
npx keylang clone https://github.com/owner/repo --explain map-and-ai --dry-run
npx keylang clone https://github.com/owner/repo --explain map-and-ai
npx keylang web https://github.com/owner/repo
```

The first line of the output tells you where the clone lives; open its `keylang/map` as you would your own. Run the same command again to pick up new commits.

`--explain map-and-ai` also asks the model for a short note on every node and writes `keylang/map-explained/`; `--explain all` adds a longer explanation of every layer. Both need a model in the environment, for example `KEYLANG_AGENT=cli:claude`, because the clone's `keylang.json` belongs to keylang. `--dry-run` prints the token estimate first and asks the model nothing. `web` with a URL makes the clone and then opens the browser UI on it.

Inside the clone, `keylang flows discover` and `keylang tour` work as above, and they are the fastest way in.

If a fence around the code was all you wanted, you can stop here. The next lesson is about a change that does not exist in the code yet.

Next: [a new feature](02-a-feature.md).
