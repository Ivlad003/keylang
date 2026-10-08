# 1. The shape

[Starting a project](README.md) · **English** · [Українською](uk/01-the-shape.md)

Give the program four jobs, the same four the shop has.

- **presentation** — the edge that a person or another program touches: a bot update, an HTTP route, a controller.
- **application** — one task, such as saving a note, creating a task, or placing an order.
- **domain** — rules that stay true even with the network unplugged: a note has text, a task has a title.
- **infrastructure** — the library, the database, the bot API. It sits beside the other three rather than under domain.

Domain does not import infrastructure, and neither does the edge. Only the task in the middle may.

```markdown
# rules

- layers domain < application < presentation
  - infrastructure
- deny domain infrastructure
- deny domain external
- deny presentation infrastructure
```

You write this file yourself. The next parts name functions, but the agent writes those functions, not you.

First create the empty app with its own tool. Then run:

```sh
npx keylang init .
```

Replace the guessed layers in `keylang.json` with the paths from the next part. While a feature is still only a wish, `keylang check` on it exits 1. That is normal for day one and does not mean the tool is broken.

`keylang feature <slug>` reports done when every `planned` line in that file matches the code, every step has a static call path, and no rule fails. Tests and traces are printed beside that answer, but they do not decide it. On exit 0 it prints `done` on stderr.

If the new project ports a process an old one already has, the first feature can come from there: `keylang flow export <flow> --out flow.bundle.md` in the old repository, `keylang flow import flow.bundle.md` in the new one. Without `--layer-map` each old layer goes to the layer of the same name, else to your first layer with a note; `--mode hybrid` asks the model to match the layers by name and description, and an answer that names no layer of yours falls back to that rule. The result is a proposal of a feature full of `planned` lines with the old signatures — the same starting point as writing it by hand.

Next: [a Telegram bot](02-telegram-bot.md).
