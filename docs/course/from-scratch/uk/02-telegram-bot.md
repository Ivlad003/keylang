# 2. Telegram-бот

[Проєкт з нуля](README.md) · [English](../02-telegram-bot.md) · **Українською**

Бот відповідає на `/start` тим, що зберігає нотатку. На цій сторінці використано Node і пакет `telegraf`, бо агент може згенерувати функцію TypeScript зі специфікації, а `spec-to-code` вміє зробити для неї заготовку. Python-бот (aiogram) спирається на ту саму специфікацію, з однією відмінністю: тест на Python пише агент, бо `spec-to-code` його не напише. Хай там як, ні функцію, ні тест ви не пишете.

Створіть проєкт, установіть `telegraf`, а потім наведіть шари на теки:

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

Імпортувати `telegraf` може лише тека бота. Правила з частини 1 уже не підпускають правила нотатки до пакетів (`deny domain external`) і не дають екрану імпортувати сховище. Додайте два рядки, щоб завдання і сховище теж не могли імпортувати пакет:

```markdown
- deny application external.telegraf
- deny infrastructure external.telegraf
```

Ці рядки безпечні, щойно `telegraf` з'явиться в `package.json`. Доти `external.telegraf` — висячий id, і keylang повідомляє про нього як K001.

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

Коли keylang будує id, частина шляху з glob-у відкидається. Тож `src/bot/start.ts` — це модуль `presentation.start`, а `onStart` у ньому — `presentation.start.onStart`. Так само `src/notes/note.ts` і `add` дають `application.note.add`, `src/domain/note.ts` і `make` — `domain.note.make`, а `src/store/store.ts` і `save` — `infrastructure.store.save`. Функція називається `make`, бо `new` у TypeScript не може бути ім'ям функції. Якщо ваші файли називаються інакше, запустіть `keylang map` і беріть id, який друкує карта.

Агент пише `add` у `src/notes/note.ts`, а обробник — у `src/bot/start.ts`. Саме другий файл імпортує `telegraf`, і саме цей імпорт робить `external.telegraf` справжнім. Обробник — це іменована функція, яку передають у бібліотеку. `add` не можна класти у файл бота, бо тоді її id зміниться. Набирати цей код вам не треба; це форма, яку має згенерувати агент:

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

keylang бачить, що `onStart` викликає `add`. А от того, що бібліотека викликає `onStart`, він часто не бачить, і це й не потрібно: у тригера в потоці немає батька, тож бачити виклик до нього не обов'язково. Крок під тригером батька має, і саме цей виклик keylang мусить побачити.

Обробник, який існує лише як `bot.start(() => add(...))`, — це дірка: у стрілкової функції немає id, який можна назвати тригером, крок лишається `unverified`, і `feature` не повідомляє, що фіча готова. Декорований обробник, як-от `@router.message(...)` в aiogram, тригером бути може, бо виклик до нього бачити не треба.

```sh
npx keylang spec-to-code application.note.add
npx keylang feature start
```

`spec-to-code` не додасть `telegraf` у `package.json` і не збереже токен бота. Установити пакет і зберігати токен — ваша справа, але це не функції; функції пише агент. Зелена фіча означає, що `onStart` викликає `add`, а `add` викликає `make` і `save`, причому ці виклики інструмент бачить. Вона не означає, що Telegram доставив повідомлення. Trace може показати, як виклик відбувається в тесті, але trace лише друкується і нічого не вирішує.

Далі: [Python CRUD](03-python-crud.md).
