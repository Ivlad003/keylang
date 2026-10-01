# 1. The shape

[Starting a project](README.md) · **English** · [Українською](uk/01-the-shape.md)

Give the program four jobs. The same four as the shop.

- **presentation** — the edge a person or another program touches. A bot update, an HTTP route, a controller.
- **application** — one task. Save a note. Create a task. Place an order.
- **domain** — rules that stay true with the network unplugged. A note has text. A task has a title.
- **infrastructure** — the library, the database, the bot API. It sits beside the other three, not under domain.

Domain does not import infrastructure. The edge does not import it either. The task in the middle may.

```markdown
# rules

- layers domain < application < presentation
  - infrastructure
- deny domain infrastructure
- deny domain external
- deny presentation infrastructure
```

You write this file. The next parts name functions. The agent writes those functions. You do not.

Create the empty app with its own tool. Then:

```sh
npx keylang init .
```

Replace the guessed layers in `keylang.json` with the paths in the next part. `keylang check` on a feature that is still a wish exits 1. That is day one, not a broken tool.

`keylang feature <slug>` is done when every `planned` line in that file matches the code, every step has a static call path, and no rule fails. Tests and traces are printed beside that answer. They do not decide it. Exit 0 prints `done` on stderr.

Next: [a Telegram bot](02-telegram-bot.md).
