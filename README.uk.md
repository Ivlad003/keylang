# keylang

[English](README.md) · **Українською**

![Ключ до розробки і розуміння проектів](docs/course/images/banner.png)

keylang — це Markdown поруч із кодом. Ви пишете специфікацію: кому що дозволено знати, і який сценарій має досі відбуватись. Функції ви не пишете. Агент генерує код із цієї специфікації. keylang агента не запускає. keylang перевіряє, що згенерований код досі збігається.

Візьміть крамницю. Екран починає покупку. Покупка просить правила замовлення зібрати замовлення. Правила замовлення не знають про екран і базу. Останнє речення — правило. Коли код його ламає, перевірка може провалити збірку.

`:`, потім `rules`, потім Enter. Курсор іде вниз до `deny`:

![Відкриття правил і рух вниз](docs/course/images/tui-rules.gif)

`/` знаходить `cli.cli.main`. На рядок нижче, `K` відкриває функцію:

![Пошук, потім K на наступному кроці](docs/course/images/tui-flow.gif)

`?` показує клавіші. Esc закриває список:

![Список клавіш, потім Esc](docs/course/images/tui-keys.gif)

Ролики зняті після `npm test`. Trace збігається, тож рядок стану — `✗ 0  ◌ 0  ✓ 34`.

Слова нові? Почніть із [підготовчого курсу](docs/course/pre/uk/README.md) ([English](docs/course/pre/README.md)). Далі — [курс](docs/course/uk/README.md) ([English](docs/course/README.md)). Фіча в репозиторії, який уже є: [цей маршрут](docs/course/existing/uk/README.md) ([English](docs/course/existing/README.md)). Telegram-бот, Python CRUD або NestJS з нуля: [цей маршрут](docs/course/from-scratch/uk/README.md) ([English](docs/course/from-scratch/README.md)). Точна граматика — [`docs/format.md`](docs/format.md). Команди — у [`docs/tools.md`](docs/tools.md). Агент ставить keylang і тримається правил «для чого / для чого ні» з [`llm.txt`](llm.txt) ([сирий файл](https://raw.githubusercontent.com/Ivlad003/keylang/master/llm.txt)). Ціль, включно з тим, чого інструмент ще не вміє, — [`docs/design.md`](docs/design.md).

Потрібен Node.js ≥ 22.18. У цьому чекауті `node bin/keylang.js` виконує TypeScript як є. Опублікований пакет — звичайний JavaScript: перед публікацією `prepack` компілює `src/` у `dist/`. На вашій машині native-код не збирається.

## Що ви пишете

| Файл | Хто пише | Що це |
|---|---|---|
| `keylang/map/*.md` | `keylang map` | Шари, модулі, функції, посилання на рядки коду. Не редагуйте |
| `keylang/rules.md` | ви | Хто від кого може залежати: `layers`, `allow`, `deny`, `entry`, `exports`, `no-cycles` |
| `keylang/flows/*.md` | ви | Один сценарій. Кожен крок звітує `ID`, `static`, `tests` і `trace` окремо |
| `keylang/features/*.md` | ви | Що будувати. `keylang feature <slug>` каже, коли готово |
| `.keylang/proposals/` | агент | Чернетка специфікації. Людина зливає її шматок за шматком |
| програма | агент | Функції, згенеровані зі специфікації. Ви їх не пишете. keylang агента не запускає |

Ім'я виглядає як `application.purchase.buy`. Це шар, модуль і функція. Це не номер рядка, тож текст переживає правки, які лише зсувають рядки.

Якщо в `keylang.json` стоїть `"explain": {"map": true}`, `keylang map` пише ще `keylang/map-explained/`: одне-два речення під кожним вузлом. З коментаря в коді, або зі збереженої нотатки, де названі модель і дата.

## Три відповіді

- `ok` — твердження справдилось там, де keylang дивився.
- `fail` — показано злам. Код виходу 1.
- `unverified` — ні те, ні те. Дірка, бракує файла, або trace старий. Це не успіх. `--strict` робить із цього код виходу 1.

Коди виходу: `0` — немає того, що блокує, `1` — порушення (застаріла карта з `map --check`, або будь-який `unverified` з `--strict`), `2` — хибний виклик або помилка файла. `parse --json` пише в stdout лише JSON. `check` пише знахідки в stdout, підсумок — у stderr.

keylang не вирішує, чи програма правильна, безпечна або закінчена.

- Речення під вузлом — проза. keylang його зберігає. Не доводить.
- Виклик, який він не може назвати (`obj[k]()`, невідомий декоратор, `eval`), — дірка. Відповідь лишається `unverified`.
- Rust і Python записують імпорти й виклики. Ребер типів не записують.
- Wiring пише TypeScript-функцію `wire()`. Він не забороняє решті програми імпортувати що завгодно. Це мають ловити правила.
- keylang читає звіти тестів і trace. Він не запускає тести, не перевіряє типи і не робить рев'ю безпеки.
- Go, Java, Ruby та інші у знімку відсутні. Відсутність не доводить, що вони ні від чого не залежать.

## Спробуйте

```sh
npx keylang init .      # вгадати шари, записати keylang.json, зібрати карту
npx keylang check       # імена і правила в keylang/
npm i -g keylang        # далі просто `keylang …`
```

З цього чекауту:

```sh
npm install
node bin/keylang.js map                  # переписати keylang/map/*.md і .keylang/index.json
node bin/keylang.js map --check          # CI: код 1, коли карта застаріла
node bin/keylang.js check                # нічого не пише
node bin/keylang.js check --strict       # unverified стає порушенням
node bin/keylang.js explain K001         # що означає код і як виправити
node bin/keylang.js                      # інтерфейс у терміналі (? — клавіші, q — вихід)
node bin/keylang.js web                  # той самий інтерфейс у браузері; відкрийте надрукований URL
```

`examples/shop` навмисно тримає хибне ім'я `domain.aggregate`. Знімка коду немає, тож потік теж не доводиться. Код виходу 1:

![check examples/shop повідомляє K001](docs/course/images/cli-shop-k001.png)

`examples/shop-fixed` виправляє ім'я. TypeScript у тій теці все одно немає, тож правила лишаються `unverified` (`no snapshot`), і перевірка завершується кодом 0:

![shop-fixed завершується кодом 0 з unverified](docs/course/images/cli-shop-fixed.png)

Нерухомі знімки нижче — `node bin/keylang.js web` на цьому репозиторії, 2026-09-28. Локальний trace і звіт `node:test` були старіші за знімок, тож ті позначки — `unverified`. Так і має бути. Рядок стану рахує рядки (найгірша позначка рядка). `keylang check` рахує кожен доказ. Той самий запуск друкує `0 fail, 22 unverified, 43 ok`, а інтерфейс показує `✗ 0  ◌ 22  ✓ 11`. Ролики зверху — пізніший запуск.

Правила цього репозиторію. Ядро мови (`lang`, `base`) і перевірка не мають залежати від екстрактора чи від tree-sitter:

![Правила з пройденими позначками і деревом шарів](docs/course/images/tui-rules.png)

Потік `check`. Ім'я точне. Статичного батька, якого можна довести, немає. Файл trace від старішого знімка:

![Потік check із позначками доказів](docs/course/images/tui-flow.png)

`K` або наведення мишею показує сигнатуру, файл і кілька рядків оголошення:

![Наведення на cli.cli.main](docs/course/images/tui-hover.png)

Решта знімків — у [уроці 8](docs/course/uk/08-use-cases.md).

## Чого це коштує

Граматика — короткий зріз Markdown. Слово означає те, що дозволяє рядок-батько. Блок коду всередині пункту списку не підтримується. `keylang fmt` не переформатує файл, вкладеності якого не довіряє, тож після `fmt` те, що показує GitHub, і те, у що вірить `check`, збігаються.

Імена ви оновлюєте самі, коли модуль перейменовують або переносять між шарами. Карта показує модулі й залежності. Розгортання, форми даних і причина рішення лишаються в прозі або в ADR.

Код виходу 0 означає: немає того, що блокує. Без `--strict` він усе ще дозволяє `unverified`.

## Що це за мова

keylang — це список, не мова програмування. Немає змінних і циклів, тож файл можна дочитати до кінця. Поганий рядок отримує код (K001–K302), і розбір іде далі. `keylang explain` каже, що код означає.

Вона виросла з Markdown-форми архітектурної мови Тимура Шемсединова. Як вона стоїть поруч з import-linter, ArchUnit, Structurizr та іншими — у [`docs/research-pl.md`](docs/research-pl.md).

## Що вже є

Короткий список. Деталі — у [`docs/design.md`](docs/design.md) §9.

- **M0.** Формат, парсер, імена між файлами, коди K001–K006, `fmt`. Ядро мови не імпортує tree-sitter.
- **M1.** Карта і правила для TypeScript і JavaScript. Коди K101–K105. Власний `keylang check` цього репозиторію не має порушень.
- **M2–M3.** Потоки з `ID`, `static`, `tests` і `trace`. Вузли `planned` (K201, K202). Один аналіз для CLI, LSP, MCP і інтерфейсу. Тонкий клієнт VS Code лежить у `editors/vscode/`. У Marketplace його немає, і в npm-пакет він не входить.
- **M4.** Інтерфейс у терміналі і `keylang web`.
- **M5.** Rust і Python на тому самому графі, з межами вище. Адаптери trace в `adapters/python` і `adapters/rust`. `keylang trace-plan <flow>` друкує, що інструментувати.
- **M6.** `# wiring` пише типізований `wire()` у `keylang.gen.ts` ([ADR 0003](docs/adr/0003-wiring-lifecycle.md)).
- **M7.** `draft`, `code-to-spec`, `spec-to-code` і `explain <id> --llm` пишуть пропозиції. `keylang mcp`: `apply_diff` пише лише пропозицію. Голос за бажанням (`Ctrl+R`). `keylang doctor` звітує і нічого не змінює.
- **M8.** `init` і `keylang agents` ставлять короткий блок в `AGENTS.md`, сервер MCP і skill для Claude Code, Codex, Cursor чи opencode ([ADR 0005](docs/adr/0005-harness-integration.md)). `keylang baseline` пише `keylang/rules.baseline.md`: залежності між шарами, яких у графі ще немає. `check --changed` і `keylang hook stop` блокують хід лише на новому порушенні. Покрито тестами CLI і MCP. Наскрізно з Claude Code і Codex на чужому репозиторії ще не перевірено.

`bench/` ганяє інструмент на восьми репозиторіях. Числа — у [`bench/results.md`](bench/results.md).

## Тести

```sh
npm test            # node:test, через справжній CLI
npm run typecheck   # tsc --noEmit
```

Інтерфейс у терміналі перевіряється без справжнього термінала (`tests/tui.test.ts`). `keylang web` — через CLI і WebSocket (`tests/web.test.ts`).

Публікація з чистого чекауту: `npm test && npm run typecheck`, далі `npm version patch` (або minor, або major) і `npm publish`. `prepack` збирає `dist/`. Перед публікацією гляньте архів через `npm pack`.
