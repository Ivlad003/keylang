# 2. Telegram-бот

[Проєкт з нуля](README.md) · [English](../02-telegram-bot.md) · **Українською**

На `/start` бот зберігає нотатку. Тут узято Node і пакет `telegraf`: агент може згенерувати функцію TypeScript зі специфікації, а `spec-to-code` уміє зробити для неї заготовку. Python-бот (aiogram) спирається на ту саму специфікацію з однією відмінністю: тест на Python пише агент, бо `spec-to-code` його не напише. В обох випадках ні функцію, ні тест ви не пишете.

Створіть проєкт, установіть `telegraf` і прив'яжіть шари до тек:

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

Імпортувати `telegraf` може лише тека бота. Правила з частини 1 уже тримають правила нотатки подалі від пакетів (`deny domain external`) і не дають екрану імпортувати сховище. Додайте два рядки, щоб пакет не могли імпортувати ще й завдання та сховище:

```markdown
- deny application external.telegraf
- deny infrastructure external.telegraf
```

Ці рядки спрацюють без помилок, щойно `telegraf` з'явиться в `package.json`. Доти `external.telegraf` — висячий id, і keylang повідомляє про нього як K001.

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

Будуючи id, keylang відкидає ту частину шляху, яку задає glob. Тож `src/bot/start.ts` — це модуль `presentation.start`, а `onStart` у ньому — `presentation.start.onStart`. Так само `src/notes/note.ts` і `add` дають `application.note.add`, `src/domain/note.ts` і `make` — `domain.note.make`, а `src/store/store.ts` і `save` — `infrastructure.store.save`. Функція називається `make`, бо `new` у TypeScript не може бути ім'ям функції. Якщо ваші файли називаються інакше, запустіть `keylang map` і візьміть id, який друкує карта.

Агент пише `add` у `src/notes/note.ts`, а обробник — у `src/bot/start.ts`. Саме другий файл імпортує `telegraf`, і саме цей імпорт робить `external.telegraf` справжнім. Обробник — це іменована функція, яку передають у бібліотеку. Класти `add` у файл бота не можна, бо тоді зміниться її id. Набирати цей код вам не треба, це лише форма, яку має згенерувати агент:

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

keylang бачить, що `onStart` викликає `add`. А от виклику `onStart` з бібліотеки він часто не бачить, і цього не треба: у тригера в потоці немає батька, тож ніхто не мусить бачити, хто його викликає. Крок під тригером батька має, і саме цей виклик keylang мусить побачити.

Обробник, який існує лише як `bot.start(() => add(...))`, — це дірка. У стрілкової функції немає id, який можна вказати як тригер, тож крок лишається `unverified`, і `feature` не скаже, що фіча готова. Декорований обробник, як-от `@router.message(...)` в aiogram, може бути тригером, бо виклик до нього бачити не треба.

```sh
npx keylang spec-to-code application.note.add
npx keylang feature start
```

`spec-to-code` не додасть `telegraf` у `package.json` і не збереже токен бота. Установити пакет і зберігати токен — ваша справа, але функцій це не стосується: їх пише агент. Зелена фіча означає, що `onStart` викликає `add`, а `add` викликає `make` і `save`, і всі ці виклики інструмент бачить. Вона не означає, що Telegram доставив повідомлення. Trace може показати виклик у тесті, але trace лише друкується і нічого не вирішує.

Далі: [Python CRUD](03-python-crud.md).
