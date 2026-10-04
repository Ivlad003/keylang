# 01: Виділити спільну операцію doctor, зберігши CLI

**What to build:** `doctor` дає той самий звіт через CLI, але його обчислення можна викликати з майбутнього TUI без stdout, argv і залежності від CLI-входу. Це обмежений підготовчий рефакторинг.
**Blocked by:** None (can start immediately).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A26, A28; ADR 0008.

## З чого почати

Знайти символи `cmdDoctor`, `main`, `loadConfig`, `llmClient`, `localStatus`, `microphoneStatus`, `voiceEngine`. Прочитати чинні CLI-тести doctor. Перевірити дозволені залежності шарів.

## Зафіксований контракт

- Новий модуль `operations` лежить нижче транспортів; він не імпортує CLI, App або renderer.
- Запит має дискримінатор `kind`, явний абсолютний `root` і предметні параметри. Початковий варіант — лише `doctor`.
- Контекст виконання містить `signal` та callback `onProgress`. Не передавати через нього UI-стан або довільний shell.
- Результат має `kind`, `status` (completed/failed/cancelled), `exitCode` (0/1/2; null для cancelled), типізований `payload`, повідомлення, `written`, `removed`, `proposals`. Повідомлення мають рівень і текст, але не є джерелом предметних даних.
- Для doctor payload містить структуровані результати мов, агента, пояснень, voice engine/model, native engine і мікрофона. Значення ключів у нього не потрапляють. Налаштування, яких бракує, не перетворюють чинний код 0 на 2.

## Кроки

1. Зафіксувати CLI-вивід doctor на тимчасовому репозиторії без агента й опційних voice-залежностей.
2. Перенести обчислення звіту в модуль операцій; root передавати явно, не читати cwd усередині нього.
3. CLI залишити парсером/форматером: викликати операцію, відтворити чинні stdout/stderr, повернути її код.
4. Не приховувати некоректну конфігурацію як «агента немає»: це окрема помилка з полем/файлом.
5. Додати шар operations до конфігурації та правил, оновити карту генератором. Не переносити всі інші обробники наперед.

## Перевірки й приймання

- [x] CLI doctor до/після має однакові рядки, порядок, stderr і код на тих самих входах.
- [x] Прямий виклик операції для root, відмінного від cwd, читає потрібний репозиторій і не пише stdout/stderr чи файлів.
- [x] Некоректний конфіг повертає помилку; відсутній ключ показується як діагностика оточення без секрету.
- [x] Немає залежності operations → CLI/TUI, жодного вкладеного keylang-процесу.

**Межі:** не створювати універсальний plugin framework; не змінювати пошук ключів або CLI-семантику doctor.
**Validation:** `npm run typecheck`, `npm test`, актуальна карта та `node bin/keylang.js check`.

## Result

Реалізовано спільну операцію doctor у новому шарі `operations` (незакомічено, diff у робочому дереві):

- **`src/operations.ts`** — контракт і реалізація. `DoctorRequest { kind: "doctor"; root }` (root абсолютний, валідується: відносний → `failed`/2, щоб операція ніколи не резолвила шляхи через cwd). `OperationContext { signal?; onProgress? }`. `OperationResult { kind; status: completed|failed|cancelled; exitCode: 0|1|2|null; payload; messages; written; removed; proposals }`. `DoctorPayload` структурований (languages, configFile, guessed, agent з state ok/missing/error і detail без значення ключа, explanations, voice з resolved без ключа, missing, error, model, modelsDir, native, microphone). Невалідний `keylang.json` → `failed`, код 2, повідомлення з файлом і полем; відсутній ключ — `state: "missing"`, код 0. Важкі адаптери (llm, voice, voice-local) підвантажуються динамічно всередині операції, як раніше в CLI. Повідомлення завершеного doctor — ті самі 7 рядків звіту (level info); payload — джерело предметних даних.
- **`src/cli.ts`** — `cmdDoctor` став принтером над `runOperation`: stdout звіт, `keylang: <error>` у stderr для failed, код з результату.
- **`keylang.json`** — шар `"operations": ["src/operations.ts"]` між tui і features; **`keylang/rules.md`** — `layers base < extract < lang < check < map < features < operations < tui < cli` + проза про шар. Карту перегенеровано штатним генератором, diff переглянуто (`keylang/map/operations.md` новий; cli.md: cmdDoctor → runOperation, edges voice/llm переїхали в operations; залежностей operations → tui/cli немає).
- **`tests/operations.test.ts`** — 5 тестів: (1) byte-parity результату операції зі stdout справжнього CLI на twin-копії репозиторію, root ≠ cwd, жодних записів у stdout/stderr (перехоплення) і файлів (treeBytes); (2) зламаний keylang.json → failed/2 з файлом і полем; (3) відсутній ключ → completed/0 з діагностикою, значення ключа не потрапляє в результат ані за відсутності, ані за наявності mode-0600 файла; (4) відносний root → failed/2; (5) aborted signal → cancelled, exitCode null, без повідомлень і записів.

Перевірки: `npm run typecheck` ✓; `npm test` 440 pass / 0 fail / 1 skipped ✓ (включно з чинними doctor-тестами cli/voice/explain/explained-map); doctor parity до/після на тих самих входах (успіх і зламаний конфіг) — byte-identical ✓; `node bin/keylang.js map --check` ✓; `node bin/keylang.js check` 0 fail ✓.

Передано наступним задачам: 02 отримує `runOperation` зі структурованим результатом і готовими рядками звіту для F6; пізніші тікети розширюють `OperationRequest`/payload новими kind і використовують `written`/`removed`/`proposals`/progress.

Коміт: `101753b` (Extract the shared doctor operation into an operations layer); перед комітом перевірено typecheck, повний набір тестів (453 pass / 0 fail / 1 skipped), `map --check` і `check`.
