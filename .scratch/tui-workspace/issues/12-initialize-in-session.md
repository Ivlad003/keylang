# 12: Виконувати повний init із початкового екрана

**What to build:** репозиторій без конфігурації отримує конфіг, карту, baseline й інтеграції; сесія переходить у робочий стан без перезапуску.
**Blocked by:** [05 — початковий екран](05-workspace-bootstrap-recovery.md), [10 — baseline](10-baseline-operation.md), [11 — agents](11-agents-integration-operation.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A01, A02, A08, A25.

## З чого почати

Знайти `cmdInit`, `guessLayout`, `configToJson`, уже виділені map/baseline/agents operations. Відрізняти orchestration init від виклику CLI-команд.

## Кроки й контракт

1. Додати shared init operation, яка композиційно використовує ті самі предметні модулі, а не викликає dispatcher по колу.
2. Форма показує root, мови/шари, selection харнесів та write/check. Існуючий конфіг зберігається; його не замінює новий guess.
3. Harness-plan перевіряється до будь-якого запису, включно з конфігом, як у чинному CLI. Відсутність підтримуваного коду — код 2.
4. Послідовність write зберегти: конфіг, карта, baseline, інтеграції. Звітувати прогрес кожного етапу та фактичні записи. Не обіцяти загальної атомарності.
5. Check зберігає саме чинну семантику init-check, а не довільну суму map-check і всіх можливих перевірок. Зафіксувати цю відмінність у формі/довідці.
6. Після успіху перечитати конфіг/FILES, повторити аналіз, прибрати welcome; після часткового збою лишити явний звіт і можливість повторити.
7. CLI init перевести на спільну оркестрацію, зберігши вивід, порядок повідомлень і пріоритет кодів.

## Перевірки

- TS repo без конфіга → TUI init; друга копія → CLI init: порівняти всі артефакти з нормалізацією лише службового часу.
- Повтор з наявним кастомним конфігом не змінює його байти.
- Зіпсований файл інтеграції: навіть конфіг не створено.
- Керований I/O-збій після запису конфіга: результат називає зроблене; repeat не стирає ручні файли.
- Init-check до/після має CLI-коди й повністю незмінний inventory.

## Приймання

- [x] Увесь happy path проходиться клавішами однієї сесії.
- [x] Вибір none/auto/explicit збігається з agents-контрактом.
- [x] Частковий init не позначається загальним success.

**Межі:** не встановлювати npm-пакети й не запускати харнеси.
**Validation:** `npm run typecheck`, `npm test`, карта/правила після інтеграції.

## Result

Реалізовано `init` (запис і `--check`) як спільну операцію-оркестрацію; CLI `init` — принтер над нею; пункт стартового екрана й палітри з формою в TUI; повторний аналіз і вихід зі стартового екрана без перезапуску.

- **`src/operations.ts`** — `InitRequest { kind: "init", root, harnesses: HarnessChoice, check, label? }`, `InitPayload { check, languages, config: { file, existed, written, error, layers, notes }, preflight, map, baseline, agents }` (етапи — конверти тих самих операцій, null — етап не запускався), `"init"` у `WRITING_KINDS`. `initSources(root, label)` — `loadConfig` + «немає підтримуваних джерел» (текст CLI). `runInit` викликає `runAgents`/`runMap`/`runBaseline` напряму (не через `runOperation`), їм не передається `beforeCommit` — він один на весь init (worker дозволяє один commit-запит на операцію); прогрес етапів із префіксом `map: …`. Write: джерела (2) → check-план agents (failed → 2, нічого не записано, конфіг теж) → `beforeCommit` → конфіг (наявний — kept; відсутній — `writeAtomic` з `guessLayout` + `configToJson`; I/O-помилка — 2 і стоп) → map → baseline → agents, кожен незалежно від попереднього (як у CLI). Код — перший ненульовий із map/baseline/agents; будь-який ненульовий — статус `failed`; скасування — `cancelled`, решта етапів null. Check: agents check (2 — стоп), baseline check; 0 якщо обидва 0, інакше 1 (саме чинна семантика; карта не порівнюється).
- **`src/cli.ts`** — `cmdInit` — принтер: stdout/stderr/порядок і коди ті самі (усі наявні CLI-тести init без змін зелені). Виділено `printMap`, `printBaseline` (як `printAgents`). Щоб зберегти пріоритет повідомлень, при невідомому `--agents` спершу перевіряються джерела (`initSources`).
- **`src/tui/actions.ts`** — дія `init` «Init: set up keylang in this repository» (Project; aliases `init`, `keylang init`, `initialize`, `init --check`, `first run`, `new project`); `START_ACTIONS = ["init", "browse", "doctor"]`.
- **`src/tui/state.ts`** — `Prompt.kind "init"`, `Prompt.details` (неселектовані рядки опису форми над пунктами).
- **`src/tui/app.ts`** — форма init: поле вибору з граматикою `--agents` (порожнє — auto; `agentsChoice`/`agentsPreview` з 11), details: `Root`, `Found: мови · layers` (guess або наявний конфіг), `keylang.json: exists, kept byte for byte` / `none yet, written from this guess`, `Harnesses: …`, порядок записів «без загального rollback», пояснення, що Check = `init --check` без карти. Невідоме ім'я лишає форму. `requestOperation`: крок збереження лише для dirty `keylang.json`/файлів харнесів (з переліком класів цілей). `endCommit`: map-check, baseline/agents/init check-записи → outdated «keylang init wrote files since this run». Після init, якщо конфіг уже є, стартовий екран закривається (`readConfig` в `reanalyze` переводить у configured, `adopt` оновлює FILES).
- **`src/tui/view.ts`** — details у коробці форми; `recordLabel`/`operationLabel` (`init`, `init check`); `initOutcome`: `set up: map, baseline, agents`, `partial: … did not finish`, `cancelled, not run: …`, `<файл> is broken, nothing written`, для check — стани двох етапів. F6: рядок конфіга (kept / written (layers) / failed), notes, кожен етап зі станом і кодом, помилки, failed/not attempted кроки, `written: N file(s)`, підказка повтору. Підказку «run `keylang init` in a shell» прибрано.
- **`docs/tools.md`** — стартовий екран оновлено; новий абзац «Init у TUI».
- **Карта** — перегенеровано `keylang/map/{cli,operations,tui}.md`, `keylang/map-explained/{cli,operations,tui,README}.md`; diff WIP `extract.md` байтово той самий до/після (`cmp`), не закомічено.
- **Тести** (`tests/tui.test.ts`, 4 нові; тест стартового екрана 05 оновлено під новий перший пункт):
  1. TS без конфіга + `.codex/`: стартовий екран з `> Init…`, форма (root, шари, auto: detected codex, порядок, check-пояснення), невідоме ім'я лишає форму; check — 1 = CLI `init --check` на twin, stdout той самий, `map` null, дерева обох незмінні, 0 аналізів; write у справжньому worker без кроку збереження — `artifacts` = CLI twin, `keylang.json` записано першим, configured, стартовий екран закрито, snapshot не guessed, FILES оновлено, старий check outdated, F6 `set up … · code 0`; після — CLI і TUI `init --check` 0 без змін дерева; F5 нічого не пише.
  2. Кастомний `keylang.json` (checkoutRepo): форма «kept», `none` = `--agents=none` (нічого харнесового, конфіг байт у байт), `claude` = `--agents=claude`; повтор ідемпотентний (крім часу index), CLI check 0.
  3. Зламаний маркер `AGENTS.md`: failed 2, preflight error, дерево незмінне (без конфіга), стартовий екран лишився; CLI — 2 і той самий stderr; F6 «nothing was written, keylang.json included». Без джерел: форма пояснює код 2; TUI failed 2 payload null, CLI той самий stderr, нічого не записано.
  4. Файл `keylang` на місці теки (після preflight): config written, map і baseline failed, agents completed, код 2, `failed`, F6 `partial: map, baseline did not finish · code 2`; сесія configured і жива. Повтор після прибирання перешкоди з ручним `keylang/rules.md`: 0, конфіг байт у байт той самий, ручний файл цілий, CLI `init --check` 0.

Коміт: `b454d51` (Set up a repository through a shared init operation in CLI and TUI); сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓; `npm test` 514 tests, 513 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 68 ok ✓.

Передано наступним задачам:
- 36 (web): init — звичайна писальна операція worker'а з одним commit; перепідключення має зберегти запис як для map/agents.
- 37: дія `init` уже в реєстрі й на стартовому екрані; форма використовує `Prompt.details` — придатне й для інших форм на вузькому екрані (рядки обрізаються шириною редактора).
- 35: `q` під час commit init так само ще не чекає кроку.

Припущення й залишки:
- Після збою одного етапу init, як і раніше в CLI, виконує наступні (map впав — baseline і agents усе одно пишуться); `failed` позначає весь запуск. Скасування між етапами зупиняє решту.
- `init --check` із baseline-кодом 2 дає 1 — дослівно чинна поведінка CLI.
- Конфіг тепер пишеться атомарно (`writeAtomic`); повідомлення I/O-помилки конфіга — `keylang: keylang.json: <причина>` (раніше — сирий текст винятку). Поява конфіга між планом і записом — kept, як у CLI.
- Вгадані шари форми — `guessLayout` на момент відкриття/набору; сам запис бере guess, обчислений операцією.
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-09-30: виконано, коміт `b454d51`.
