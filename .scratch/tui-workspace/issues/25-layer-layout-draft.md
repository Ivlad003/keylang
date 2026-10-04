# 25: Пропонувати розкладку шарів і переносити її в буфер конфігурації

**What to build:** користувач переглядає draft map та явно переносить тільки layers у конфігурацію без автоматичного запису.
**Blocked by:** [05 — конфіг-буфер](05-workspace-bootstrap-recovery.md), [23 — моделі й скасування](23-model-flow-and-cancellation.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A12, A22.

## З чого почати

Знайти map-гілку `cmdDraftLayout`, `guessLayers`, `draftLayoutWithModel`, `configToJson`, `loadConfig`, редагування config-buffer. Поточна CLI-команда лише друкує результат.

## Кроки й рішення

1. Shared layout operation повертає валідовані layers та preview-конфіг; algo/llm/hybrid і fallback як CLI. Сама операція нічого не записує.
2. Форма mode; у F6 показати запропоновані шари й дію «Перенести layers в конфігурацію».
3. На явне перенесення перевірити generation і config-buffer version, з якими підготовлено кандидат. Нова правка після початку робить його outdated; запропонувати повтор, не тихе накладання.
4. Розібрати актуальний JSON-об'єкт конфігурації, замінити лише layers; зберегти решту полів, включно з невідомими полями. Не серіалізувати лише відомий тип Config з утратою решти.
5. Результат — одна undoable правка dirty-буфера. Якщо конфіга немає, створити буфер з валідним inferred baseline-конфігом і запропонованими layers; файл з'явиться лише після Ctrl+S.
6. Невалідний JSON не виправляти вгадуванням: відкрити конфіг із причиною. Після save стандартний аналіз перечитує налаштування.

## Перевірки

- Конфіг з agent, explain, check, exclude й додатковим полем: після перенесення змінено семантично лише layers.
- До Ctrl+S диск та файлові proposals незмінні; Ctrl+Z відкочує перенесення.
- Зміна конфіга під час запиту: outdated, новий текст не втрачено.
- Algo/llm preview і hybrid fallback узгоджені з CLI; invalid returned layers не застосовано.

## Приймання

- [x] Не розширено формат proposals на JSON.
- [x] Draft map не записує Markdown-карту й не замінює map-generator.
- [x] Unknown config fields не губляться.

**Межі:** збереження оригінального JSON-whitespace не гарантується; зміст інших полів зберігається.
**Validation:** `npm run typecheck`, `npm test`.

## Result

Чернетка розкладки шарів — спільна операція `draft-layout`: CLI `draft map [--mode]` — принтер над нею; у TUI — форма з палітри, F6-звіт і явне перенесення лише `layers` у буфер `keylang.json`.

- **`src/operations.ts`** — `DraftLayoutRequest { kind: "draft-layout", root, mode?: algo|llm|hybrid }` (не в `WRITING_KINDS`: нічого не пише), `DraftLayoutPayload { mode, layers, preview, configExists, agent, fallback }`. `runDraftLayout`: `loadConfig` (невалідний — 2) → `modelSetup(mode, agent, "draft map")` (llm без моделі — 2, hybrid — algo з `fallback`) → algo: `guessLayout`, без аналізу; модель: аналіз без `persistFacts` → `draftLayoutWithModel` з signal (Cancel → cancelled; невалідні шари — failed 2) → `preview` = `configToJson` як у CLI. Повідомлення — ті самі рядки stderr CLI. `modelSetup` тепер приймає `agent` замість `Analysis`.
- **`src/config.ts`** — `withLayers(file, text, layers)`: JSON.parse, об'єкт-корінь, заміна лише `layers` на місці (відсутній — у кінець), решта полів і їхній порядок зберігаються; не JSON / не об'єкт — `{ error }` у форматі `parseConfig`.
- **`src/draft-llm.ts`** — `draftLayoutWithModel(…, options: LlmCallOptions = {})`.
- **`src/cli.ts`** — `draftMapPrinter`; стару map-гілку `cmdDraftLayout` і імпорти `configToJson`/`guessLayers` прибрано.
- **`src/tui/actions.ts`** — дія `draft-layout` «Draft layers: the layout keylang would guess, or the model's (algo, hybrid, llm)», група Generate, aliases `draft map`, `draft layers`, `layer layout`, `propose layers`…; доступна й на стартовому екрані (недоступна в MERGE і під час операції).
- **`src/tui/state.ts`** — `Prompt.kind "draft-layout"`, `layoutDraft { mode }`.
- **`src/tui/app.ts`** — форма (`mode` ←→, run; типово hybrid за `agent`; llm без `agent` — відмова форми); запуск без save-кроку (dirty `keylang.json` лишається dirty). `layoutBases`: на старті запис версії буфера `keylang.json`, тексту файла й `snapshotId`; `layoutStale` — правка буфера (або буфер, відкритий після старту з іншим текстом), зміна диска, новий знімок. `afterLayoutDraft` позначає outdated одразу. F6 Enter → `moveLayers`: outdated — нічого не змінює, наступний Enter перезапускає; інакше база = текст буфера / файла / (без конфіга) `preview`, `withLayers`, невалідний JSON — відкрито `keylang.json` з причиною без змін; результат — одна undoable правка (`undo.push` + `setText`), режим edit, курсор на `"layers"`, запис позначено «moved»; якщо результат невалідний як конфіг з інших причин — повідомлення. Новий буфер `keylang.json` (newFile) зберігається в корінь: `newFileProblem`/`persist` для `CONFIG_FILE`.
- **`src/tui/view.ts`** — мітки `draft map[ --mode m]`, підсумок `N layer(s), nothing written · code 0`, F6: заголовок `Draft layers · <mode>[ (hybrid without a model)] · nothing written, not even a proposal`, шари, рядок Enter (наявний конфіг / новий буфер), `── keylang draft map … · stdout ──`; підказка панелі `Enter move layers into keylang.json`.
- **`docs/tools.md`** — абзац «Чернетка розкладки шарів (algo, llm, hybrid)»; фразу «`draft map` лишається окремою гілкою CLI» прибрано.
- **Карта** — перегенеровано `keylang/map{,-explained}/{base,cli,features,operations,tui}.md` і `map-explained/README.md`; ці файли = генерація в чистій копії HEAD + файли 25 (README — з рядком extract як у HEAD); WIP `extract.md` байтово ті самі (sha1 файлів і diff до/після), не закомічено.

Тести (`tests/tui.test.ts`, +4; хелпери `layoutForm`, `layoutRecord`, `cliMap`, `GUESSED_LAYERS`):
1. algo з конфігом із `$schema`, `agent`, `explain`, `check`, `exclude`: payload = CLI `draft map --mode algo` (stdout і stderr), дерево незмінне; F6 → Enter: JSON буфера = вихідний з новими `layers`, порядок ключів той самий; диск і proposals незмінні до Ctrl+S; Ctrl+Z повертає текст (буфер чистий); перенесений запис — outdated, Enter перезапускає; Ctrl+S → файл, configured, аналіз бачить нові шари й `agent`.
2. Без `keylang.json`: стартовий екран, перенесення відкриває новий буфер = CLI preview, файла немає до Ctrl+S; після — configured.
3. Модель (held mock): промпт має файли; правка `keylang.json` під час запиту → outdated, Enter не накладає, текст правки цілий, повтор → перенесення поверх правки, Ctrl+Z повертає текст з правкою; Cancel → cancelled/null, з'єднання закрито; невалідний JSON у буфері → причина, буфер не змінено; hybrid без моделі = CLI (stdout і stderr fallback), F6 `algo (hybrid without a model)`.
4. Невалідні шари моделі (`core.domain`) → failed 2 з причиною, `keylang.json` навіть не відкрито, дерево незмінне.
- Чинні CLI-тести `draft map` (`tests/draft.test.ts`, `tests/format-rules.test.ts`) проходять без змін.

Перевірки: `npm run typecheck` ✓; `npm test` 544 tests, 543 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 24 unverified / 47 ok, код 0 ✓ (unverified — застарілий звіт node-test, як і раніше); порівняння CLI зі збіркою HEAD (`git archive`) з локальним mock на 20 сценаріях (типовий hybrid, algo, hybrid/llm без agent, невідомий `--mode`, невалідний JSON/поле, без конфіга, підтеки, agent без ключа, llm/hybrid з моделлю, невалідне ім'я/glob/зарезервоване/масив/без JSON, `draft rules --print`) — stdout, stderr, код, дерево: 20 SAME.

Коміт: `a6f3580` (Draft layers through a shared draft-layout operation and move them into the config buffer); сторонній WIP не зачеплено.

Передано наступним задачам:
- 37: дія `draft-layout` у реєстрі; доступна й на стартовому екрані.
- 35/36: перенесення — правка буфера, не файловий запис; outdated-логіка в `layoutStale` (базис зберігається в App, не в `OperationRecord`).
- `withLayers` — чиста утиліта для будь-якої майбутньої заміни поля конфіга без втрати інших полів.

Припущення й залишки:
- «generation» з тікета реалізовано як базис: версія буфера `keylang.json`, текст файла на диску й `snapshotId` (знімок порівнюється, лише коли відомий і на старті, і зараз). Правки інших специфікацій чернетку не роблять outdated.
- Draft читає збережений `keylang.json` (як CLI); dirty-конфіг перед запуском не зберігається, перенесення йде в актуальний буфер.
- Після перенесення запис позначається outdated («moved»), щоб Enter не переносив ті самі шари вдруге; повторний Enter запускає нову чернетку.
- Ctrl+Z нового буфера `keylang.json` повертає порожній несохранений буфер.
- JSON.parse/stringify: дублікати ключів і точність великих чисел у конфігу не зберігаються (у валідному `keylang.json` таких немає); пробіли не зберігаються (межа тікета).
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `a6f3580`; критерії приймання перевірено тестами з локальними mocks і порівнянням CLI з HEAD.
