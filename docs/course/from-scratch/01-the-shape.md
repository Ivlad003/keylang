# 1. The shape

[Starting a project](README.md) · **English** · [Українською](uk/01-the-shape.md)

Before any of the three apps, decide the shape they all share. Give the program four jobs, the same four the shop has:

- **presentation** — the edge that a person or another program touches: a bot update, an HTTP route, a controller.
- **application** — one task, such as saving a note, creating a task, or placing an order.
- **domain** — rules that stay true even with the network unplugged: a note has text, a task has a title.
- **infrastructure** — the library, the database, the bot API. It sits beside the other three rather than under domain.

Neither domain nor the edge imports infrastructure; only the task in the middle may. The store saves what the domain makes, so it needs the domain's types. A need from the side layer into the chain is K101 until an `allow` permits it.

```markdown
# rules

- layers domain < application < presentation
  - infrastructure
- allow infrastructure domain
  The store saves the objects the domain makes.
- deny domain infrastructure
- deny domain external
- deny presentation infrastructure
```

You write this file yourself. The next parts name functions, and the agent writes them.

First create the empty app with its own tool. Then run:

```sh
npx keylang init .
```

Replace the guessed layers in `keylang.json` with the paths from the next part. While a feature is still only a wish, `keylang check` exits 0 with every planned line `unverified`, and `keylang feature` exits 1 with a list of what is missing. That is normal on day one; the tool is not broken.

`keylang feature <slug>` reports done when every `planned` line in that file matches the code, every step has a static call path, and no rule fail of this change remains. It then exits 0 and prints `done` on stderr. Tests and traces are printed beside that answer, but they do not decide it.

If the new project ports a process that an old one already has, the first feature can come from there. Run `keylang flow export <flow> --out flow.bundle.md` in the old repository and `keylang flow import flow.bundle.md` in the new one. Without `--layer-map`, each old layer goes to the layer with the same name, or else to your first layer with a note. `--mode hybrid` asks the model to match the layers by name and description; if its answer names no layer of yours, the same fallback applies. You get a proposed feature full of `planned` lines with the old signatures, the same starting point as writing it by hand.

Next: [a Telegram bot](02-telegram-bot.md).
