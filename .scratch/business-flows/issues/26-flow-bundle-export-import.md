# 26: `keylang flow export|import`: переносний пакет бізнес-флоу

**Status:** resolved

**Type:** code

**Blocked by:** 12

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна)

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

CLI-основа для 25 і 27.

- `flow export <name>… [--with-callees N] [--out file.md]`: самодостатній Markdown — флоу, для кожного ID вид/сигнатура/brief/файл:рядок у джерелі, бізнес-опис (12), тести, події й інтеграції флоу, коментар походження (`repo`, `commit`, `snapshotId`).
- `flow import <file> [--into features/<slug>.md] [--layer-map old=new,…] [--mode algo|llm]`: у цільовому репо — пропозиція фічі: кроки на `planned`-вузлах у шарах нового проєкту (відповідність шарів — прапорець або модель з валідацією), тести як `test` під кроками, вихідні ID — у таблицю відповідності (27).
- Потім звичайний цикл: `spec-to-code` агентом → `feature <slug>` показує готовність.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [x] round-trip: export з фікстури A → import у фікстуру B → `feature` бачить усі planned
- [x] пакет читається людиною й `parse` без помилок
- [x] docs/cli.md, курс from-scratch/existing

**Межі:** —

## Comments

### Реалізація (2026-10-08)

- `src/flow-bundle.ts` (чисте ядро) + `src/operations/flow-bundle.ts` (операції `flow-export`, `flow-import`) + `keylang flow export|import` у `src/cli.ts`; звіти F6 у `src/tui/reports/discover.ts`.
- **Формат пакета (format=1):** перший рядок `<!-- keylang:bundle format=1 repo=… commit=<HEAD|n/a> snapshot=… keylang=<версія> flows=… with-callees=N -->`; прозою — таблиці `## Шари`, `## Вузли` (ID, вид, сигнатура, шар, `файл:рядок`, перше речення doc, роль `flow`/`callee k`, потоки), `## Тести`, `## Події й інтеграції` (`emits` + сайти `integrations` і вебхуки вузлів потоку); далі секції `# flow` як написані (рукописні з `flows/**`, інакше знайдені з `flows-discover`) з коментарем `<!-- keylang:bundle origin=… source=… -->` і цитатою процесу (12), коли він є; **останнім — порожній блок ```` ```keylang-layout ````** для 25. `parse` — без діагностик (тест). `--out` не пише під `<dir>/` (його прочитав би `check`) і не перезаписує файл, що не є пакетом.
- **Імпорт:** дві пропозиції — фіча `<dir>/features/<перший потік>.md` (ID переселено в шари, `planned <вид> <id> <оригінальна сигнатура>` перед першим елементом, кожне ID раз на файл, шлях `test` переселено коренем шару, коментар `keylang:import` з походженням) і `<dir>/migration.md` із секцією `# migration <slug>` і рядками `- map <old> → planned <new>`. Відповідність шарів: `--layer-map`, інакше `algo` (те саме ім'я, інакше перший шар — з приміткою), `llm`/`hybrid` — модель одним запитом (текст пакета огороджено `<untrusted-bundle>`), невалідний шар чи не-JSON → `algo` з приміткою.
- **Граматика:** щоб `check` у цільовому репо не давав K006/K005 на таблиці відповідності, додано мінімальну секцію `# migration <name>` з рядками `map <id> → [planned] <id>` і `dropped <id> <причина>` (вид вузла `migrate`/`dropped`, без посилань і без перевірок — їх додасть 27). docs/grammar.md §2, §5.
- **Мови:** тести — TS (A) → Python (B); код мовно-незалежний (ID, шари, корені глобів).
- **Припущення:** шлях `test` переселяється лише коренем шару, розширення не змінюється (`.ts` у Python-репо лишиться `.ts`; `spec-to-code` тоді пише примітку «write it by hand»). Коментарі `keylang:discover doc=…`/`keylang:algo unresolved` зберігають вихідні ID — це походження, не специфікація. ID `external.*` не плануються. Сигнатура, яку граматика не прочитала б одним рядком, опускається з приміткою.
- Тести: `tests/flow-bundle.test.ts` (6): експорт і `parse`, помилки `--out`, round trip A→B з `--layer-map` → accept → `feature` бачить 4 planned → `spec-to-code --print`, `algo`-фолбек із приміткою, `--mode llm` через фейковий агент із невалідною відповіддю, юніт таблиць і секції migration.
