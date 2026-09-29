# 2. A Telegram bot

[Starting a project](README.md) · **English** · [Українською](uk/02-telegram-bot.md)

The bot answers `/start` by saving a note. This page uses Node and the `telegraf` package, because `spec-to-code` can stub a TypeScript function. A Python bot (aiogram) uses the same spec. You write the Python test yourself.

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

Only the bot folder may import `telegraf`. Part 1 already stops the note rules (`deny domain external`) and stops the screen from importing the store. Add two lines so the task and the store cannot import the package either:

```markdown
- deny application external.telegraf
- deny infrastructure external.telegraf
```

These lines are safe once `telegraf` is in `package.json`. Until then, `external.telegraf` is a dangling id (K001).

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

The glob is stripped. `src/bot/start.ts` is the module `presentation.start`, and `onStart` is `presentation.start.onStart`. `src/notes/note.ts` and `add` is `application.note.add`. `src/domain/note.ts` and `make` is `domain.note.make`. `src/store/store.ts` and `save` is `infrastructure.store.save`. `make` is the name because `new` is not a legal function name in TypeScript. After `keylang map`, use the id the map prints if your file name differs.

`add` lives in `src/notes/note.ts`. The handler lives in `src/bot/start.ts`, and that file is the one that imports `telegraf`. The import is what makes `external.telegraf` real. Pass the handler to the library. Do not put `add` in the bot file, or its id changes.

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
bot.start((ctx) => onStart(ctx.message.text));
```

keylang can see `onStart` calling `add`. It often cannot see the library calling `onStart`, and it does not need to. The trigger has no parent. The step under it does.

A handler that only exists as `bot.start(() => add(...))`, or only as a decorator, is a hole. The step stays `unverified`, and `feature` stays not done.

```sh
npx keylang spec-to-code application.note.add
npx keylang feature start
```

`spec-to-code` will not add `telegraf` to `package.json` and will not store the bot token. You do that. A green feature means `onStart` calls `add`, and `add` calls `make` and `save`, by calls the tool can see. It does not mean Telegram delivered the message. A trace can show the call in a test. The trace is printed. It does not decide.

Next: [a Python CRUD](03-python-crud.md).
