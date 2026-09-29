# 2. Telegram-бот

[Проєкт з нуля](README.md) · [English](../02-telegram-bot.md) · **Українською**

Бот відповідає на `/start` тим, що зберігає нотатку. Тут Node і пакет `telegraf`, бо `spec-to-code` вміє зробити заготовку функції TypeScript. Python-бот (aiogram) має ту саму специфікацію. Тест на Python ви пишете самі.

Створіть проєкт, поставте `telegraf`, потім наведіть шари на теки:

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

Лише тека бота може імпортувати `telegraf`. Частина 1 вже зупиняє правила нотатки (`deny domain external`) і не дає екрану імпортувати сховище. Додайте два рядки, щоб завдання і сховище теж не імпортували пакет:

```markdown
- deny application external.telegraf
- deny infrastructure external.telegraf
```

Ці рядки безпечні, коли `telegraf` уже є в `package.json`. Доти `external.telegraf` — висячий id (K001).

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

Glob зрізається. `src/bot/start.ts` — модуль `presentation.start`, а `onStart` — `presentation.start.onStart`. `src/notes/note.ts` і `add` — `application.note.add`. `src/domain/note.ts` і `make` — `domain.note.make`. `src/store/store.ts` і `save` — `infrastructure.store.save`. Ім'я `make`, бо `new` у TypeScript не може бути ім'ям функції. Після `keylang map` беріть id, який друкує карта, якщо ім'я файла інше.

`add` живе в `src/notes/note.ts`. Обробник живе в `src/bot/start.ts`, і саме цей файл імпортує `telegraf`. Імпорт і робить `external.telegraf` справжнім. Передайте обробник у бібліотеку. Не кладіть `add` у файл бота, інакше id зміниться.

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

keylang бачить, що `onStart` кличе `add`. Що бібліотека кличе `onStart`, він часто не бачить, і це не потрібно. У тригера немає батька. У кроку під ним є.

Обробник, який існує лише як `bot.start(() => add(...))` або лише як декоратор, — дірка. Крок лишається `unverified`, і `feature` не стає готовим.

```sh
npx keylang spec-to-code application.note.add
npx keylang feature start
```

`spec-to-code` не додасть `telegraf` у `package.json` і не збереже токен бота. Це робите ви. Зелена фіча означає, що `onStart` кличе `add`, а `add` кличе `make` і `save` — викликами, які інструмент бачить. Вона не означає, що Telegram доставив повідомлення. Trace може показати виклик у тесті. Trace друкується. Він не вирішує.

Далі: [Python CRUD](03-python-crud.md).
