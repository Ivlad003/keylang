# 13: Форматувати поточну специфікацію або вибрані шляхи

**What to build:** TUI запускає fmt або fmt-check і показує змінені, невалідні та недоступні файли.
**Blocked by:** [09 — запис і оновлення буферів](09-map-write-and-commit-protocol.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A09, A10, A25.

## З чого почати

Знайти `cmdFmt`, `formatSource`, `keylangFiles`, `assertConfigFormat`, перевірки ідемпотентності та пропуску stored explanations. Прочитати нормативний формат перед зміною оркестрації.

## Кроки

1. Додати shared fmt operation з paths і checkOnly. Defaults форми — поточний spec-файл; вибір теки явний.
2. Перед дією використати save-barrier; formatter читає збережені байти, не перезаписує dirty-overlay потай.
3. Залишити чинну обробку parse-errors, продовження після недоступного файла й пріоритет коду 2 над відмінностями.
4. Форматувати через `formatSource`; не реалізовувати другий formatter у TUI. Stored explanations пропускаються з поясненням.
5. Write проходить файловий протокол, включно з expected text і обліком успішних файлів. Check лише порівнює й не пише кешів.
6. Оновити чисті буфери, зберегти курсор у допустимому діапазоні й запустити аналіз.

## Перевірки

- Неканонічний файл → fmt → повтор: текст як у CLI, другий запуск ідемпотентний.
- Тека з валідним, parse-error і недоступним файлом: ті самі результати й код, що CLI; валідний оброблено.
- Fmt-check відмінного файла: код 1, жодних записів.
- Unicode/CRLF, stored explanation та зміна цілі перед commit: немає втрати тексту.

## Приймання

- [x] Форма показує реальний набір вибраних шляхів і write/check.
- [x] Помилка одного файла не приховує вже виконаних змін інших.
- [x] Семантика документа після форматування й чинні CLI-тести збережені.

**Межі:** не додавати автоматичне форматування при кожному save.
**Validation:** `npm run typecheck`, `npm test`; карта/правила при перенесенні модулів.

## Result

Реалізовано `fmt` (запис і перевірка) як спільну операцію з фазами обчислення/commit, CLI — принтер над нею; форма в TUI і звіт F6.

- **`src/files.ts`** — `collectMdFiles(paths, base?)`: відносні шляхи читаються від `base`, а не від cwd; імена файлів — як задано (CLI друкує ті самі рядки).
- **`src/operations.ts`** — `FmtRequest { kind: "fmt", root, paths, base?, check }`, `FmtPayload { check, files: FmtFile[] }` зі станами `current`/`stale`/`formatted`/`invalid`/`explanation`/`unreadable`/`failed`/`not-attempted`; `"fmt"` у `WRITING_KINDS`; `runFmt`, `commitFormatted`, `fmtMessages`. Спершу `assertFormatOnly` конфігу, читання й `formatSource` кожного файла (помилка читання чи K003 не зупиняє решту; stored explanation — `explanation`). Check — без `beforeCommit`, нічого не пише. Write — після `beforeCommit` кожен файл: перевірка expected text (`changed on disk while it was formatted; nothing written`), проба запису (`r+`, read-only лишається EACCES), `writeAtomic(landing, text, { exact: true })` — байти форматера, CRLF → LF як у CLI. Коди 2 > 1 > 0; failed при коді 2; скасування між файлами — `not-attempted`, null.
- **`src/cli.ts`** — `cmdFmt` async-принтер: `info` → stdout, `error` → stderr, warning (пропущене пояснення) — мовчки, як раніше.
- **`src/tui/*`** — дія «Format: write or check specifications» (Edit; aliases `fmt`, `format`, `keylang fmt`, `fmt --check`, `canonical form`), `Prompt.kind = "fmt"`: поле шляхів (через пробіл, відносно кореня, за замовчуванням поточний `.md`), примітка з реальним набором файлів і кількістю незбережених, пункти `Write: format N file(s)` / `Check N file(s) (writes nothing)`; шлях поза коренем — відмова у формі. Save barrier: dirty-буфери під вибраними шляхами й `keylang.json`; інші dirty лишаються. `endCommit` (для всіх writing-операцій): чистий буфер записаного файла одразу бере текст і EOL з диска, `clampCursor`, feature-записи outdated; check-записи fmt цих файлів — outdated. F6: кожен файл (`canonical`, `not formatted`, `formatted`, `invalid` + діагностики, `skipped`, `unreadable`, `not written` + причина).
- **`docs/tools.md`** — абзац «Fmt у TUI».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,lang,operations,tui}.md` і `map-explained/README.md`; WIP `extract.md` байтово ті самі до/після, не закомічені.
- **Тести** (`tests/tui.test.ts`, 3 нові; 6 CLI-тестів fmt без змін і зелені):
  1. Поточний файл: форма з дефолтом, розгортання теки, `not found`; check — 1, stdout = CLI, дерево незмінне; write — байти й stdout = CLI-близнюк = `messy.expected`, лише цей файл, старий check outdated, чистий буфер = диск, курсор у межах; повтор write/check — 0 без записів, CLI `--check` 0.
  2. Тека з валідним, K003, нечитабельним (000), CRLF+Unicode і stored explanation: код 2 у TUI і CLI, stdout/stderr однакові (з точністю до кореня), валідні записані, CRLF → LF як у CLI, буфер CRLF отримав LF/eol, invalid і explanation не змінені; повторний check — 2 без записів; F6.
  3. Barrier: лише вибраний dirty-файл; Back нічого не пише; Save and continue — форматуються збережені байти, інший dirty не зачеплено; тека з зовнішньою зміною одного файла в паузі перед commit — він `not written`, байти ззовні лишились, інший записаний, код 2.

Коміт: `410fb24` (Format specifications through a shared fmt operation in CLI and TUI); сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓; `npm test` 502 tests, 501 pass / 0 fail / 1 skipped ✓ (до перегенерації карти падав лише тест актуальності карти); `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 68 ok ✓.

Передано наступним задачам:
- 37: дія `fmt` у каталозі палітри; 35: скасування посеред commit fmt — загальний протокол, окремо не тестувалось.
- `endCommit` тепер сам оновлює чисті буфери записаних файлів (текст, EOL, курсор) — для wire/apply можна не дублювати.

Припущення й залишки:
- Контракт: CLI fmt пише атомарно (temp + rename) замість запису на місці; жорсткі посилання розриваються; повідомлення EACCES для read-only файла тепер з абсолютним шляхом (`open '/…/b.md'`).
- Файл, змінений між читанням і записом, — помилка цього файла з кодом 2 (як I/O), не відмова всього плану з кодом 1: файли незалежні, як у CLI.
- Генеровані файли й шляхи поза repo CLI форматує як раніше (без guard `writeProblem`); у TUI шляхи поза коренем відхиляє форма.
- Шляхи з пробілами у формі TUI не підтримуються (роздільник — пробіл).
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-09-30: виконано, коміт `410fb24`.
