# Результати бенчмарку

Як відтворити: `bench/clone.sh`, потім `bench/run.sh`. Скрипт копіює кожен репозиторій у тимчасовий каталог без `node_modules`, `target` і `.git` (оригінали не змінюються) і там виконує:

1. `keylang map` без `keylang.json`, тобто з вгаданими шарами;
2. `keylang check` на згенерованій карті;
3. негативні проби `bench/inject.ts` (з M1.1 — п'ять, див. нижче); кожна ламає копію в один спосіб, запускає справжній CLI й відновлює файли.

## M3 — 2026-09-27

### Кеш фактів (тікет 23)

`keylang map` лишає `.keylang/cache/facts.json`: факти кожного файла за вмістом, версією екстрактора й граматик. `check`, `map --check` і `lsp` його читають, але не пишуть; кеш іншої версії чи зіпсований ігнорується. Граф і знімок щоразу будуються з усіх фактів, тож зміна експорту в B перерезолвлює імпортери A (`tests/analyze.test.ts`).

storefront-next-template (898 файлів, копія з `bench/run.sh`), Node v24.20.0, 8 ядер, `check` з одним зміненим `.tsx`, три запуски:

| Режим | мс |
|---|---|
| `check` без кешу | 4784, 4933, 4847 |
| `check` із кешем від `map`, один файл змінено | 2131, 1822, 1828 |
| `map` без кешу / `map --check` з кешем | 5878 / 1973 |

Решта ~1.8 с — читання й хешування всіх файлів, побудова графа, знімка й карти; tree-sitter працює лише для зміненого файла. Кеш — 4.5 МБ.

## M2 — 2026-09-27

Реальний потік keylang — `keylang/flows/check.md`: `main → run → cmdCheck → analyze → (generateMap, parse, assess → (check, evaluateRules, evaluateFlows)) → writeCheck`, два `invariant` із `test`. Порядок перевірки: `npm test` (репортер `node:test` пише `.keylang/reports/node-test.json`, тест `@flow check` пише `.keylang/trace/check.jsonl`), потім `node bin/keylang.js check --strict`:

| Доказ | Результат |
|---|---|
| `ID` | 11/11 ok (trigger і 10 кроків) |
| `static` | 10/10 ok (сусідні кроки шляху між собою не потребують) |
| `tests` | 2/2 ok (звіт поточного знімка) |
| `trace` | 11/11 ok (вкладення й порядок в одному тесті, один годинник) |
| правила | 3 × `deny` ok, `no-cycles` ok |
| усього | `0 fail, 0 unverified, 38 ok`, код 0 |

Після будь-якої зміни джерел без перезапуску `npm test` ті самі рядки `tests` і `trace` стають `unverified` «stale report» / «stale trace», а `--strict` дає 1 — звіт іншого знімка не підтверджує поточний код.

### Негативні сценарії M2 (CLI-тести `tests/flows.test.ts`)

| Сценарій | Результат |
|---|---|
| крок видалено з коду | K001 на кроці, без другого `static fail` |
| крок досяжний лише через колбек | `static unverified` з позицією виклику `cb` |
| шляху немає в повністю розв'язаному графі; крок-модуль | `unverified`, не `fail`; «not a callable» |
| крок видалено, trace завершений і інструментований | `trace fail missing step` |
| той самий trace з `dropped: 1` / відкритим span | `unverified incomplete trace` |
| зайвий виклик між кроками | `ok` не змінюється |
| повтор кроку в специфікації при одному виклику | перший `ok`, другий `fail` (одна подія — один крок) |
| повтор і рекурсія в коді (адаптер) | окремі `spanId` на кожен виклик |
| sibling-и на різних годинниках без `links` / з `links` | `order unverified` / `ok` |
| sibling-и перекриваються | `unverified … (parallel)` |
| асинхронний крок без `link` / з `link` (адаптер: `setTimeout`) | `unverified` / `ok` |
| гілка `when` не виконувалась | `branch not exercised`, її кроки не обов'язкові |
| trace і звіт іншого знімка або без `snapshotId` | `stale trace` / `stale report` / «not bound to a snapshot» |
| тест провалився / пропущений / дві suite з однією назвою | `tests fail` (код 1) / `skipped` / `ambiguous` з кандидатами |
| `planned` без коду → код з'явився → інший вид чи сигнатура; дублікат | `unverified planned` → K202 і перевірка як код → K201; K002 |
| «не більше 3 retry» без тесту | «needs a separate predicate or test» |

Не відтворено: зміна тіла без зміни сигнатури — це стейлнес прози, тікет 21 чекає рішень людини щодо формату й місця baseline.

## M1.1 — 2026-09-27

Node v24.20.0, keylang 0.1.0, ті самі коміти репозиторіїв, що й для M1. Лог: `KEYLANG_BENCH_WORK=<dir> bench/run.sh`, по пробах — `<dir>/<repo>.probes`.

### Негативні проби на реальних репозиторіях

| Проба | Що ламає | Очікування за контрактом |
|---|---|---|
| `deny-import` | `deny A B` + статичний імпорт A → B | K102 |
| `deny-dynamic` | `deny A B` + літеральний `import()` у функції A | K102 |
| `removed-fn` | flow `step` на fn файлового модуля, весь файл замінено на `export const marker = 1` | K001 на кроці (модуль `complete`, членів немає) |
| `manual-map` | `keylang/map/<layer>.md` без маркера `keylang:generated` | `map` код 1, файл не перезаписано |
| `shadowed-call` | `function __keylangShadow(f) { return f(); }` поруч з fn `f` модуля | немає resolved-ребра, `coverage`: `shadowed by parameter` |

| Репозиторій | Результат проб |
|---|---|
| circlecam | 5/5: `app.circlecam → main.camera`, `app.circlecam.buildWindow` K001 |
| meet-unmirror | 5/5: `main.content → main.popup`, `main.content.acceptNameLabel` K001 |
| reslop | 5/5: `bin.reslop → diff.align`, `bin.reslop.fail` K001 |
| kosmo-tui | 5/5: `bin.kosmo-tui → code.params`, `code.params.bareArrowHeader` K001 |
| storefront-next-template | 5/5: `app.config_server → components.account-navigation`, `…order-badge-shared.getPaymentMethodDisplays` K001 |
| health-tracker (`web/`) | 5/5: `web.src.api → web.src.errors`, `web.src.api.api` K001 |
| voice-transcriber | пропущено: TS/JS-модулів немає |
| Index | пропущено: `map` без мов, код 2 |

Ті самі сценарії, а також видалення останньої fn, затінення в кожному виді області (деструктуризація, блок, вкладена функція, колбек, `for…of`, `catch`), `exports` з alias/default/`export *`, self-import як цикл, JSON/SARIF/github — CLI-тести в `tests/cli.test.ts`.

### Tarball на двох версіях Node

`npm pack` → `npm install <tgz>` у порожній каталог → запуск `node_modules/keylang/bin/keylang.js` на копії `tests/fixtures/repo`:

| Node | `--version` | `map` | `check` | `check --format sarif` | `--explain-edge app domain` |
|---|---|---|---|---|---|
| v22.18.0 (мінімум з `engines`) | 0.1.0 | 0 | `0 fail, 0 unverified, 2 ok` | 0 | call + import з позиціями |
| v24.20.0 (поточна LTS) | 0.1.0 | 0 | `0 fail, 0 unverified, 2 ok` | 0 | call + import з позиціями |

Після `npm pack` `bin/keylang.js` відновлено (`postpack`), `git status` чистий.

### Самоопис keylang

`keylang.json` + `keylang/rules.md` + `keylang/flows/check.md`: 29 файлів, 29 модулів, 215 fn, 78 типів, 105 залежностей. `map --check` — 0; `check --strict` — 0, без `unverified` у правилах (виклики через локальні значення не роблять `deny` неповним, див. `docs/format.md` §7).

### Виклики після резолвінгу з областями видимості (тікет 10)

| Репозиторій | resolved | external | dynamic | unresolved |
|---|---:|---:|---:|---:|
| keylang | 337 | 350 | 982 | 21 |
| circlecam | 65 | 121 | 76 | 2 |
| meet-unmirror | 40 | 14 | 36 | 0 |
| reslop | 2425 | 706 | 2120 | 185 |
| kosmo-tui | 1207 | 683 | 1831 | 245 |
| storefront-next-template | 2623 | 4863 | 8585 | 72 |
| health-tracker/web | 144 | 132 | 406 | 1 |

`resolved` не зменшився на жодному репозиторії порівняно з M1 (kosmo-tui: 4 виклики з `external` перейшли в `dynamic` — це локальна `const window = (…) => …` у `src/code/snippet.ts:143`, яку раніше помилково рахували глобалом `window`). Проміжна версія, що затінювала будь-який виклик методу параметра (`items.reduce`), переводила ~570 викликів keylang у `unresolved`; тепер затінення — лише коли локальне ім'я ховає імпорт або оголошення модуля, решта — `dynamic`.

`map` storefront: 4.4 с проти 2.0 с у M1 на тій самій машині під навантаженням паралельних процесів; окремий замір інкрементальності — тікет 23.

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

Ребра знімка мають `provenance: syntactic` і власний `resolution` (tree-sitter, без типів; на вузлі більше немає `precision`). Виклики розбито на чотири групи, які не змішуються між собою (дослідження §4: `unverified` ≠ `ok`).

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
