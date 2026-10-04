# 08: Перевіряти актуальність карти у worker з прогресом і скасуванням

**What to build:** `Map: check` показує stale/conflicts, не пише файлів і не заморожує редактор.
**Blocked by:** [07 — дискові операції та save-крок](07-feature-status-save-barrier.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A07, A08, A23, A24.

## З чого почати

Знайти `cmdMap`, `analyze`, `diffMap`, `SnapshotWorker`, `generateMap`, worker entry. SnapshotWorker зараз може fallback на UI-потік: новий operation-worker так робити не повинен.

## Контракт і кроки

1. Виділити read-only гілку map-check у shared operations; повернути conflicts/stale/stats і CLI-код. `persistFacts` вимкнено.
2. Створити worker-adapter виконання операцій. Повідомлення несуть operationId, тип progress/result/error; запит — лише cloneable дані. Callback і AbortSignal живуть на своєму боці, не передаються structured clone.
3. TUI запускає операцію через worker. CLI може виконувати той самий модуль напряму; немає другої предметної реалізації.
4. Помилка запуску worker стає результатом дії з кодом 2, а не синхронним fallback. Подальші спроби можуть створити новий worker.
5. Для read-only роботи Cancel може завершити worker; звільнити pending promises і ресурси. Позначити cancelled, exitCode null, відкинути пізні повідомлення.
6. За потреби перевести аналіз feature з 07 на цей adapter, щоб важка дискова перевірка також не блокувала ввід.
7. Esc лише згортає F6. Повторний запуск після завершення/скасування використовує новий ID; один active job на сесію.

## Перевірки

- Актуальна, застаріла й конфліктна карта: ті самі findings/codes, що CLI; рекурсивний inventory файлів до/після однаковий.
- Затримана реальна worker-операція: клавіші й resize відображаються до завершення, не лише після.
- Cancel до result → cancelled, нуль записів; пізній result не змінює історію.
- Worker помирає/не стартує → зрозуміла помилка, нова спроба працює, TUI живий.

## Приймання

- [x] Немає запису cache/index/stats у map-check.
- [x] Девелоперський TS і опублікований JS мають коректний worker entry за чинним зразком.
- [x] У кожного запиту є рівно одне остаточне завершення, resources закриваються із сесією.

**Межі:** запис карти — 09; не вбивати worker під час майбутнього файлового commit.
**Validation:** `npm run typecheck`, `npm test`, актуальна карта й перевірка шарів.

## Comments

- 2026-09-30 — реалізовано map-check як спільну read-only операцію, worker операцій з прогресом/скасуванням і перенесено feature у worker (A07 частково — лише перевірка, A08 для map, A23, A24 до запису). Перевірки пройшли (результат нижче). Статус лишаю `ready-for-agent` до рішення людини щодо закриття.

## Result

Реалізовано read-only `map-check` у спільних операціях, worker-адаптер операцій сесії, дію «Map: check», скасування й переведення feature в worker.

- **`src/operations.ts`** — `MapCheckRequest { kind: "map-check", root, label? }` (`label` — як caller називає корінь у повідомленні «no supported source files under …», CLI передає свій аргумент). `runMapCheck`: `analyze({ specs: [], withoutEvidence: true, persistFacts: false })` → чинний `diffMap`; payload `MapCheckPayload { conflicts, stale, stats, warnings, snapshot }`, шляхи POSIX від кореня. Код 0/1; немає джерел, невалідний конфіг, збій аналізу → failed, 2. Прогрес: `reading the sources`, `comparing with the files on disk`. `mapCheckLines` — рядки CLI (stale не перелічуються при конфліктах, як раніше). `resultWithout(kind, status, code, error?)` — типізований результат без payload для транспорту/скасування (замінив `failedResult` в app.ts).
- **`src/cli.ts`** — гілка `map --check` — принтер над операцією (stderr `warning: …`, stdout рядки відносно cwd, коди незмінні; помилка → `keylang: …`, 2, як раніше через `main`). Гілка запису `map` не чіпана (09).
- **`src/tui/operation-worker.ts`** (новий entry) — протокол `OperationCall { operationId, request }` / `OperationReply` (`progress` | `result` | `error`); запускає `runOperation` зі своїм `analyze`. Cancel-повідомлення немає: read-only скасовується terminate.
- **`src/tui/background.ts`** — `OperationWorker` (URL `.ts`/`.js` за зразком `SnapshotWorker`, `entry`/`workerData` для тестів). `run` = `OperationRunner`: кожен запит завершується рівно раз — результатом, failed 2 (не стартував / `error` / `exit` / DataCloneError), cancelled (abort, `close()`); пізні повідомлення відкидаються за ID і за поточним worker. Fallback у UI-потік немає; після збою наступний запит створює новий worker. Abort read-only → terminate (інші pending — failed 2 з причиною). `ref` лише поки є pending. Після `close()` — failed «the session is closed».
- **`src/tui/app.ts`** — `AppOptions.operationWorker` (сесія володіє й закриває); типовий runner: doctor — у потоці сесії, feature і map-check — у worker (лінива ініціалізація). `startOperation`: `AbortController`, `onProgress` → `record.progress` і рядок стану, `settle` приймає лише перше завершення (пізній result після Cancel не змінює запис). `cancelOperation` (палітра «Cancel the running operation», `x` у F6); `close()` скасовує активну операцію й закриває worker. Дія `map-check` → `requestOperation` (крок збереження, бо `keylang.json` читається з диска). `adopt` позначає map-check `outdated` при іншому snapshot, як feature.
- **`src/tui/actions.ts`** — `map-check` («Map: check», aliases `map check`, `map --check`, `stale map`, `up to date`; недоступна в MERGE і під час іншої операції), `cancel` (доступна лише під час операції).
- **`src/tui/state.ts`** — `OperationRecord.progress`.
- **`src/tui/view.ts`** — звіт map-check у F6 (read-only, snapshot, результат, conflict/stale рядки, попередження, лічильники), `recordSummary` (`up to date`/`N stale`/`N conflict(s)`), `running: <progress>…`, підказка `x cancel · Esc back` на активному записі.
- **`src/tui/web.ts`** — `onQuit` тепер викликає `app.close()` (ресурси сесії закриваються).
- **`keylang/rules.md`** — `entry tui.operation-worker` і текст про worker-и TUI.
- **`docs/tools.md`** — абзац «Перевірка карти (`map --check`), worker операцій і скасування», `x` у таблиці клавіш.
- **Карта** — `keylang/map/{cli,operations,tui}.md`, `keylang/map-explained/{cli,operations,tui,README}.md` перегенеровано штатним генератором; diff WIP-файлів `extract.md` байтово той самий до й після.
- **Тести:** `tests/tui.test.ts` (5 нових), `tests/operation-worker-gate.ts` (тестовий entry: падає на старті, поки спільний лічильник > 0; блокується на `Atomics.wait` до відкриття gate; далі — справжній worker):
  1. Актуальна / застаріла / конфліктна карта: рядки з payload = stdout `keylang map --check`, код = CLI (0, 1, 1); `treeBytes` до/після TUI і CLI однаковий; кожен запуск — окремий ID; F6 показує звіт.
  2. Затриманий реальний worker: `↓`, F2 і resize відображаються у фреймі до результату; другий запуск відмовлено; Esc згортає F6, робота триває; `x` → cancelled, exitCode null, нуль записів; відкритий gate після cancel не змінює запис; повтор — новий ID у новому worker, код як у CLI.
  3. Runner, що ігнорує signal: Cancel з палітри → cancelled; пізній result не змінює status/result/finished, записів 1.
  4. Відсутній модуль worker → failed 2 «the operation worker failed», сесія відповідає; worker, що помирає на старті → failed 2 «exited with code 3», наступний запуск — completed.
  5. `OperationWorker` напряму: abort → cancelled; інший pending → один failed; прогрес доходить; `close()` → pending cancelled, новий запит — failed 2.
  - `tests/cli.test.ts` (packed tarball): у tarball є `dist/tui/operation-worker.js`; `OperationWorker` із встановленого пакета виконує map-check з тим самим кодом, що упакований CLI (скрипт-файл, бо worker успадковує `--input-type` від `--eval`).

Коміт: `5cd13f9` (Check the map in a TUI operation worker with progress and cancel); лише файли 08, сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓; `npm test` 487 tests, 486 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (код 0); `node bin/keylang.js check` 0 fail / 0 unverified / 68 ok, код 0 ✓ (одразу після регенерації до прогону тестів було 23 unverified через застарілий звіт тестів — зникло після `npm test`).

Передано наступним задачам:
- 09: `map` (запис) ще в `cmdMap`; новий kind додати в `OperationRequest`/`OperationPayloads`/`runOperation`/`resultWithout`. `READ_ONLY` у `background.ts` визначає, коли Cancel може вбити worker: kind із записом туди не додавати — для нього потрібне кооперативне скасування (cancel-повідомлення + signal у worker), якого поки немає.
- 15, 31 і пізніші важкі операції: достатньо не-doctor kind — він автоматично йде у worker.
- 35: `close()` скасовує активну операцію без запитання; діалог «лишитися / скасувати й вийти» ще не зроблено.

Припущення й залишки:
- Окремий kind `map-check`, а не `map` з прапорцем: запис (09) матиме інший payload і гарантії.
- Doctor лишено в потоці сесії: він легкий і пробує опційні native-модулі, поведінка яких у worker не перевірялась; тести з ін'єкцією `operations` і далі замінюють усі runner-и.
- F6 показує stale-файли й за наявності конфліктів (з позначкою), тоді як CLI їх не друкує; payload містить обидва списки.
- Під час роботи worker-а F5 і далі йде через `SnapshotWorker` — два worker-и можуть працювати паралельно.
- Ручну TTY-перевірку наживо не виконано.

