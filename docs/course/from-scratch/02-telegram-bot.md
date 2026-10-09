# 2. A Telegram bot

[Starting a project](README.md) · **English** · [Українською](uk/02-telegram-bot.md)

The bot answers `/start` by saving a note. This page uses Node and the `telegraf` package, because an agent can generate a TypeScript function from the spec and `spec-to-code` can stub one. A Python bot (aiogram) uses the same spec, with one difference: the agent writes the Python test, because `spec-to-code` will not. Either way, you write neither the function nor the test.

Make the project, install `telegraf`, then point the layers at folders:

```json
{
  "languages": ["typescript"],
  "layers": {
    "presentation": ["src/bot/**"],
    "application": ["src/notes/**"],
    "domain": ["src/domain/**"],
    "infrastructure": ["src/store/**"]
  }
}
```

Only the bot folder may import `telegraf`. The rules from part 1 already keep the note rules away from packages (`deny domain external`) and stop the screen from importing the store. Add two lines so that the task and the store cannot import the package either:

```markdown
- deny application external.telegraf
- deny infrastructure external.telegraf
```

These lines are safe once `telegraf` is in `package.json`. Until then, `external.telegraf` is a dangling id, and keylang reports it as K001.

`keylang/features/start.md`:

```markdown
# flow start

- planned module external.telegraf
- planned fn presentation.start.onStart (text: string) → void
- planned fn application.note.add (text: string) → Note
- planned fn domain.note.make (text: string) → Note
- planned fn infrastructure.store.save (note: Note) → void
- trigger presentation.start.onStart
  - step application.note.add
    - step domain.note.make
    - step infrastructure.store.save
```

When keylang builds an id, the glob part of the path is stripped. So `src/bot/start.ts` is the module `presentation.start`, and `onStart` in it is `presentation.start.onStart`. In the same way, `src/notes/note.ts` and `add` give `application.note.add`, `src/domain/note.ts` and `make` give `domain.note.make`, and `src/store/store.ts` and `save` give `infrastructure.store.save`. The function is called `make` because `new` is not a legal function name in TypeScript. If your file names differ, run `keylang map` and use the id the map prints.

The agent writes `add` in `src/notes/note.ts` and the handler in `src/bot/start.ts`. That second file is the one that imports `telegraf`, and it is this import that makes `external.telegraf` real. The handler is a named function passed to the library. `add` must not go in the bot file, or its id would change. You do not type any of this; it is the shape the agent must generate:

```ts
export function add(text: string): Note {
  const note = make(text);
  save(note);
  return note;
}
```

```ts
import { Telegraf } from "telegraf";

export function onStart(text: string): void {
  add(text);
}
const bot = new Telegraf(process.env.BOT_TOKEN ?? "");
bot.start((ctx) => onStart(ctx.message.text));
```

keylang can see `onStart` calling `add`. It often cannot see the library calling `onStart`, and it does not need to: the trigger has no parent in the flow, so nothing has to be seen calling it. The step under it does have a parent, and that call is the one keylang must see.

A handler that only exists as `bot.start(() => add(...))` is a hole: an arrow function has no id to name as the trigger, the step stays `unverified`, and `feature` does not report done. A decorated handler, such as aiogram's `@router.message(...)`, is fine as the trigger, because nothing has to be seen calling it.

```sh
npx keylang spec-to-code application.note.add
npx keylang feature start
```

`spec-to-code` will not add `telegraf` to `package.json`, and it will not store the bot token. Installing the package and keeping the token are your jobs, but they are not the functions; the agent writes those. A green feature means that `onStart` calls `add`, and `add` calls `make` and `save`, through calls the tool can see. It does not mean Telegram delivered the message. A trace can show the call happening in a test, but the trace is only printed and does not decide.

Next: [a Python CRUD](03-python-crud.md).
