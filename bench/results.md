# Результати бенчмарку

Як відтворити: `bench/clone.sh`, потім `bench/run.sh`. Скрипт копіює кожен репозиторій у тимчасовий каталог без `node_modules`, `target` і `.git` (оригінали не змінюються) і там виконує:

1. `keylang map` без `keylang.json`, тобто з вгаданими шарами;
2. `keylang check` на згенерованій карті;
3. пробу `bench/inject.ts`: бере два модулі A і B (з різних шарів, коли це можливо), пише `deny A B`, дописує імпорт A → B, перегенеровує карту й очікує K102.

## M1 — 2026-09-27

Node v24.20.0, keylang 0.1.0. Коміти репозиторіїв: circlecam f22e5bf, health-tracker b4e527d, Index d60aa9f, kosmo-tui db3f42d, meet-unmirror fc05f66, reslop 9fb36a7, storefront-next-template 1a5b952, voice-transcriber 4871f19.

| Репозиторій | Файлів | Модулів | fn | Залежностей | `map`, мс | `check` карти | Проба (заборонений імпорт) |
|---|---:|---:|---:|---:|---:|---|---|
| keylang (власний `keylang.json` + `rules.md`) | 20 | 20 | 127 | 58 | ~270 | 0 помилок | див. `tests/cli.test.ts`: K101 + K102 + K105 |
| circlecam | 6 | 6 | 63 | 14 | 190 | 0 помилок | ✅ `app.circlecam → main.camera` |
| meet-unmirror | 3 | 3 | 30 | 0¹ | 174 | 0 помилок | ✅ `main.content → main.popup` |
| reslop | 93 | 93 | 1509 | 276 | 475 | 0 помилок | ✅ `bin.reslop → diff.align` |
| kosmo-tui | 68 | 68 | 688 | 261 | 477 | 0 помилок | ✅ `bin.kosmo-tui → code.params` |
| storefront-next-template | 898 | 1004 | 1971 | 4923 | 2014 | 0 помилок | ✅ `app.config_server → components.…order-badge-shared` |
| health-tracker (лише `web/`, TS) | 31 | 37 | 82 | 167 | 264 | 0 помилок | ✅ `web.src.api → web.src.errors` |
| voice-transcriber (Rust) | 0 | — | — | — | 133 | — | пропущено: TS/JS-модулів немає (Rust — M4) |
| Index (лише Markdown) | 0 | — | — | — | — | — | `no supported source files`, код виходу 2, без падіння |

¹ Chrome-розширення: скрипти спілкуються через глобальні змінні з `manifest.json`, імпортів між ними немає. Нуль залежностей тут правильний результат.

### Виклики

`precision: syntactic`: tree-sitter, без типів. Виклики розбито на чотири групи, які не змішуються між собою (дослідження §4: `unverified` ≠ `ok`).

| Репозиторій | resolved | external | dynamic | unresolved |
|---|---:|---:|---:|---:|
| circlecam | 65 | 121 | 76 | 2 |
| meet-unmirror | 40 | 14 | 36 | 0 |
| reslop | 2425 | 706 | 2120 | 185 |
| kosmo-tui | 1207 | 687 | 1827 | 245 |
| storefront-next-template | 2623 | 4863 | 8585 | 72 |
| health-tracker/web | 144 | 132 | 406 | 1 |

Що означають групи:

- **resolved** — ціль знайдено в карті: локальна fn, імпортована fn, `ns.fn`, `Cls.method`, `this.method`, деструктуризація `const { f } = mod`.
- **external** — виклик у пакет, вбудований модуль або глобальне ім'я (`Map`, `JSON`, `setTimeout`).
- **dynamic** — виклик через локальне значення (`x.method()`, колбек, замикання, `setState` з хука). Без типів такий виклик не простежити; M2+ може уточнити його через LSP (`precision: typed`).
- **unresolved** — ім'я належить імпорту або оголошенню, але цілі в карті немає. Здебільшого це вкладені функції та перевантаження.

### Попередження `map`

- health-tracker — 5 × `unresolved import ../lib/meal` тощо. Каталогу `web/src/lib` немає в репозиторії: його, найімовірніше, ігнорує Python-шаблон `.gitignore` (`lib/`). Це проблема репозиторію, а не keylang.
- storefront — 6 × `./types`, `../types`. Відповідних файлів у репозиторії немає: вони генеруються під час збірки.
- kosmo-tui — `bin/kosmo-tui.js → ../dist/cli.js`, тобто результат збірки.

### Що виправлено завдяки бенчмарку

- `tsconfig` з рядками `"**/*"` ламав наївне вирізання коментарів, тому storefront-аліаси `@/…` йшли в `external`. Тепер працює лексер JSONC, що зважає на рядки, і `extends` обробляється по ланцюжку.
- Вузли `web-tree-sitter` при кожному зверненні — нові об'єкти, тому `require()` не розпізнавався (0 залежностей у circlecam і reslop). Тепер вузли порівнюються за `id`.
- Додано стиль Metarhia `const { a, b } = mod;` (деструктуризація імпортованого модуля).
- Виклики методів класу (`this.parse`) не прив'язувалися.
- Псевдонім залежності збігався з ID підмодуля (`nav-item`), що давало 115 × K002 у згенерованій карті storefront.
- Сигнатури з `[…]` (`(errs: [Span, string][])`) давали K005.
- `keylang map` у корені keylang заходив у `bench/repos`. Тепер вкладені репозиторії (каталог з `.git`) не індексуються.
- Файли поза вгаданими шарами (`docs/`, `scripts/`) пропускаються, а не звалюються в `unassigned`; з явним `keylang.json` `unassigned` лишається сигналом.
- Каталоги `stories/` і `*-snapshot.*` тепер виключено за замовчуванням.
- Імпорти React Router `./+types/…` вважаються згенерованими.

### Відкрите

- storefront: 2 с на 900 файлів. Прийнятно для `map`, але для TUI потрібен інкрементальний індекс (M2): tree-sitter лише для змінених файлів.
- Вгадані шари беруть перший рівень каталогів. На storefront це 16 шарів-каталогів `src/*` плюс `app` (файли в корені). `keylang init` записує їх у `keylang.json` для ручного редагування; пропонування шарів LLM — M5.
- `dynamic` — найбільша група. Типізований режим через `tsserver`/LSP розглядаємо в M2.
