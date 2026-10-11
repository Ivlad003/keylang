# 2. A Telegram bot

[Starting a project](README.md) · **English** · [Українською](uk/02-telegram-bot.md)

The bot answers `/start` by saving a note. This page uses Node and the `telegraf` package: an agent can generate a TypeScript function from the spec, and `spec-to-code` can stub one. A Python bot (aiogram) uses the same spec with one difference: `spec-to-code` will not write the Python test, so the agent writes it. Either way, you write neither the function nor the test.

Create the project, install `telegraf`, then point the layers at folders:

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

Only the bot folder may import `telegraf`. The rules from part 1 already keep the note rules away from packages (`deny domain external`) and stop the screen from importing the store. Two more lines keep the task and the store away from the package too:

```markdown
- deny application external.telegraf
- deny infrastructure external.telegraf
```

Add these lines after `telegraf` is in `package.json`. Before that, `external.telegraf` is a dangling id, and keylang reports it as K001.

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

When keylang builds an id, it strips the glob part of the path. So `src/bot/start.ts` is the module `presentation.start`, and `onStart` in it is `presentation.start.onStart`. Likewise, `src/notes/note.ts` and `add` give `application.note.add`, `src/domain/note.ts` and `make` give `domain.note.make`, and `src/store/store.ts` and `save` give `infrastructure.store.save`. The function is called `make` because `new` is not a legal function name in TypeScript. If your file names differ, run `keylang map` and use the id the map prints.

The agent writes `add` in `src/notes/note.ts` and the handler in `src/bot/start.ts`. The second file imports `telegraf`, and that import is what makes `external.telegraf` real. The handler is a named function passed to the library. `add` must not go in the bot file, or its id would change. You do not type any of this; it is the shape the agent must generate:

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

keylang can see `onStart` calling `add`. It often cannot see the library calling `onStart`, and it does not need to. The trigger has no parent in the flow, so nothing has to be seen calling it. The step under it does have a parent, and keylang must see that call.

A handler that only exists as `bot.start(() => add(...))` is a hole. An arrow function has no id to name as the trigger, so the step stays `unverified` and `feature` does not report done. A decorated handler, such as aiogram's `@router.message(...)`, works as the trigger, because nothing has to be seen calling it.

```sh
npx keylang spec-to-code application.note.add
npx keylang feature start
```

`spec-to-code` will not add `telegraf` to `package.json`, and it will not store the bot token. Installing the package and keeping the token are your jobs; the functions are the agent's. A green feature means that `onStart` calls `add`, and `add` calls `make` and `save`, through calls the tool can see. It does not mean Telegram delivered the message. A trace can show the call happening in a test, but the trace is only printed and does not decide.

Next: [a Python CRUD](03-python-crud.md).
