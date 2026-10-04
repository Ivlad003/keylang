# 05: Відкривати робочий простір без конфігурації та відновлюватися після її помилки

**What to build:** перший запуск показує стан проєкту; некоректний конфіг можна виправити в тій самій сесії.
**Blocked by:** [02 — палітра](02-palette-doctor-results.md), [03 — помилка аналізу](03-failed-analysis-stays-stale.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A01 (початковий екран), A02.

## З чого почати

Знайти конструктор `App`, `findRoot`, `loadConfig`, `guessLayout`, список файлів і відкриття конфігурації як тексту. Розрізняти відсутній файл, невалідний файл і валідний конфіг без джерел.

## Кроки

1. Ввести явні початкові стани: configured, missing-config, invalid-config. Наявність знімка — окрема властивість.
2. Для missing-config показати root, вгадані мови/шари, «Переглянути» й doctor; дія init з'явиться в 12, не створювати фальшиву реалізацію.
3. «Переглянути» запускає чинний аналіз із вгаданою конфігурацією, нічого не зберігаючи.
4. Invalid-config показує точний файл/поле та відкриває його сирий текст незалежно від успіху analyzer. Не запускати повторні однакові помилки в циклі.
5. Після Ctrl+S перечитати конфіг, повторити аналіз і перейти в configured без нового процесу.
6. Якщо конфіг dirty, показати, що активні параметри взято з диска. Не застосовувати непарсений текст як overlay-конфіг.

## Перевірки

- Репозиторій із TS без конфіга: початковий екран і inferred browse, нуль записів.
- Некоректний JSON та окремо невалідне поле: виправлення → save → успішна сесія.
- Валідний конфіг без підтримуваних джерел: doctor/редактор доступні, snapshot-dependent дії пояснюють недоступність.
- Старт із підтеки використовує визначений root, не створює другий проєкт у підтеці.

## Приймання

- [x] Жодна відновлювана помилка конфігурації не закриває TUI.
- [x] Перший запуск без init нічого не пише.
- [x] Чинна TTY-вимога запуску не змінена.

**Межі:** init і довільне перемикання root тут не реалізуються.
**Validation:** `npm run typecheck`, `npm test`.

## Comments

- 2026-09-30 — реалізовано A01 (частина без init) і A02: стартовий екран без конфігурації, recovery невалідного `keylang.json` у тій самій сесії, пояснення недоступності snapshot-дій. Перевірки пройшли (результат нижче). Статус лишаю `ready-for-agent` до рішення людини щодо закриття.

## Result

Реалізовано явні стани конфігурації сесії й відновлення без нового процесу.

- **`src/tui/state.ts`** — `ConfigState`: `configured` | `missing-config` (вгадані мови, шари, notes перейменувань) | `invalid-config` (reason із полем). `State.config`, `State.start` (вибраний пункт стартового екрана або null). Наявність знімка — окремо: `analysis?.snapshot`.
- **`src/tui/app.ts`** — `configState(root)` читає `keylang.json` з диска (`parseConfig`; для відсутнього — `loadConfig` + `guessLayout`). Конструктор: missing → стартовий екран, analyzer не викликається; invalid → відкриває сирий текст `keylang.json` із курсором на полі/позиції JSON (`configErrorCursor`, експортована чиста функція), analyzer не викликається; configured → як раніше. `reanalyze(explicit)` спершу виконує `readConfig`: поки конфіг невалідний, analyzer не запускається (жодного циклу однакових збоїв), старий звіт лишається `outdated`, роботу в польоті скинуто поколінням; повідомлення — лише на явний F5/Ctrl+S або зміну причини. Якщо конфіг зламався під час сесії, у view/read він відкривається (Ctrl+O повертає). Після Ctrl+S з виправленням — стан configured і аналіз без перезапуску. `overlay()` більше не включає буфер `keylang.json`. Стартовий екран: `↑↓/jk`, Enter, F5 (Browse), `:`/Ctrl+P, `?`, F6, `q`; мишка під ним ігнорується; відкриття файла закриває його. Нові дії палітри: `browse`; `check` зі стартового екрана = Browse. `t` без знімка пояснює причину.
- **`src/tui/actions.ts`** — `ActionContext.start/missingConfig/noSnapshot`, `noSnapshotReason(state)`, `START_ACTIONS = ["browse", "doctor"]`, `START_REASON`. `find-node`, `toggle-map` показують причину без знімка (invalid / немає джерел / ще не Browse / аналіз іде чи впав); `reading`, `edit`, `merge` недоступні під стартовим екраном.
- **`src/tui/view.ts`** — `drawStart` (корінь, мови й шари, notes, пункти, «Nothing is written… run `keylang init` in a shell», підказки) на всю ширину тіла; рядок стану: `invalid keylang.json: <причина>`, `no keylang.json: Browse…`, `no supported source files`, `configNote` (`guessed configuration: no keylang.json, nothing written`, `keylang.json unsaved: the analysis uses the saved file`) — перед фазою, щоб довга причина її не обрізала. Те саме в рядку стану панелі F6 і в поясненні порожнього списку знахідок.
- **`docs/tools.md`** — абзац «Старт без конфігурації та відновлення».
- **Карта** — `keylang/map/tui.md`, `keylang/map-explained/{tui,README}.md` перегенеровано штатним генератором (нове ребро `tui.view → base.config`, нові fn). Diff WIP-файлів `extract.md` байтово той самий до й після (порівняно `cmp`).
- **Тести** (`tests/tui.test.ts`, 6 нових): (1) TS без конфіга: стартовий екран з root і вгаданими шарами, 0 викликів analyzer до Browse, причина недоступності find-node, doctor зі стартового екрана, Browse → знімок вгаданих шарів, F5, байти всього дерева незмінні; (2) невалідний JSON: відкрито `keylang.json` на рядку/колонці помилки, повторні F5 → 0 викликів, незбережена правка не застосовується й позначена, Ctrl+S → configured, 1 аналіз; (3) невалідне поле `languages`: курсор на полі, причина find-node, doctor; виправлення → аналіз; зламаний на диску конфіг (`layers.external`) → звіт лишається outdated, конфіг відкрито, Ctrl+O повертає, виправлення → configured; (4) валідний `{}` без джерел: `snapshot === null`, `no supported source files`, причина toggle-map, редактор і doctor доступні, нічого не записано; (5) старт із підтеки: `findRoot` → root конфігу, у підтеці нічого не створено; (6) CLI без TTY: usage, код 2, stdout порожній, нічого не записано.

Коміт: `b75b93c` (Open the TUI without a config and recover from an invalid one); лише файли 05, сторонній WIP (`extract.md`, `src/extract/ts.ts` тощо) не зачеплено. Файл тікета — у `.scratch/` (gitignored).

Перевірки: `npm run typecheck` ✓; `npm test` 470 tests, 469 pass / 0 fail / 1 skipped ✓ (перший прогін упав лише на застарілій карті — перегенеровано); `node bin/keylang.js map --check` ✓ (код 0); `node bin/keylang.js check` 0 fail / 5 unverified / 63 ok, код 0 ✓ (unverified — звіт node-test не прив'язаний до знімка, як і раніше).

Передано наступним задачам:
- 06: `State.config`/`noSnapshotReason` — готова умова доступності для нового spec-буфера; стартовий екран закривається відкриттям файла.
- 12: пункт «Set up keylang…» додати в `START_ACTIONS` першим (реєстр `ACTIONS` + case у `runAction`); після init викликати `reanalyze()` — `readConfig` сам переведе сесію в configured. Підказку «run `keylang init` in a shell» у `drawStart` тоді прибрати.
- 25: dirty-конфіг уже позначено й виключено з overlay.

Припущення й залишки:
- Для відсутнього конфіга root — `findRoot(cwd)`, тобто сама тека запуску (як CLI `init`); пошук git-кореня не додавався.
- «Немає підтримуваних джерел» = `analysis.snapshot === null` (як у CLI: порожній список мов). Конфіг із мовою, для якої немає файлів, дає порожній, але наявний знімок.
- Помилки конфігу, які виявляє лише `analyze` (напр. `check.trace: no such file`), лишаються звичайним невдалим аналізом (03), не станом invalid-config.
- Колонка JSON-помилки береться з повідомлення V8 (`line N column M`, інакше `position N`); для CRLF-файлів позиція може зсуватися.
- Ручну TTY-перевірку наживо не виконано.
