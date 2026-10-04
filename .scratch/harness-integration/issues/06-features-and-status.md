# 06: Файли фіч і `feature_status`

**Джерело:** spec Q2, Q6, Q7, Q21; CONTEXT «Feature»

**What to build:** `keylang/features/<slug>.md` — звичайна рукописна специфікація; `check` читає її як будь-яку. `feature_status {slug}` (MCP) і `keylang feature <slug> [--format json]` (CLI; 0 — готово, 1 — прогалини, 2 — немає файла чи помилка виклику) обчислюють критерій: кожен `planned` файла реалізований (K202, без K201); кожен крок кожного потоку файла static `ok`; жодного `fail` правил у всіх специфікаціях (порушення, внесене фічею, видно тут). Результат — `done` і список прогалин `{kind, id, file, line, col, reason}`; тести й trace — окремим інформаційним полем. Стабільний порядок прогалин. format.md: розділ про `features/` і команду.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] фікстура фічі: planned fn не реалізовано → прогалина `planned`; реалізовано → K202, прогалини немає
- [x] крок без ребра → прогалина `static` з позицією кроку
- [x] нове порушення `deny` → прогалина `rule`, код 1
- [x] невідомий slug — код 2
- [x] JSON-вивід CLI — лише JSON у stdout

Ключові файли: новий модуль статусу фічі (чиста функція над `Assessment`), `src/cli.ts`, `src/mcp.ts`, `docs/format.md`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 88a9ac1, 98adfa9; `src/feature-status.ts`, `src/cli.ts`, `src/mcp.ts`; tests/cli.test.ts «feature: planned, static and rule gaps, then done; JSON is the only stdout», «planned module external.<pkg>…» (static-прогалина з line 5); опис — `docs/tools.md#agents`, посилання з `docs/format.md` §7.
