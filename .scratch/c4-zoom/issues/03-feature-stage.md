# 03: Стадія фічі й чесне `done`

**Джерело:** spec §4.2 B1, B3, Р3, Р9, §1b; research-c4-zoom-tools §4; research-c4-zoom-literature §6

**What to build:** `featureStatus` (`src/feature-status.ts`) повертає `stage` і `hints[]` поруч із `gaps[]`. Інваріант «`done` тоді й лише тоді, коли `gaps` порожній» лишається. Кожна прогалина й підказка отримує поле `stage`.

Нові прогалини, що блокують `done` (Р9):

- `empty` — у файлі немає жодного `planned`, `trigger`, `step` чи `calls`. Зараз такий файл, наприклад лише з прозою, `feature` вважає готовим (відтворено 2026-10-04).
- `diagnostic` — діагностика-помилка K001–K005 у самому файлі фічі, з кодом і позицією. Зараз рядок, який парсер відкинув з K004, просто не перевіряється: файл «готовий», хоча `check` на ньому дає код 1 (відтворено 2026-10-04).

Нові підказки, що не блокують `done`: `trigger` — потік без `trigger`; `steps` — потік без жодного `step`, `calls`, `when` чи `invariant`.

**Стадія.** `done`, коли прогалин немає. Інакше перша умова згори:

1. `idea` — у файлі немає секції `# flow`;
2. `behavior` — є підказка `trigger` чи `steps`;
3. `structure` — є прогалина чи підказка стадії structure: тут `diagnostic`, а тікети 04–05 додають `question`, `deny`, `layer`, `signature`;
4. `ready` — лишились тільки прогалини реалізації: `planned`, `static`, `rule`, `spec`.

**Вивід.** Людський: прогалини як зараз, далі рядки `hint: …`, підсумок `<n> gap(s) · stage <stage>`; рядок `done` готової фічі не змінюється. `--format json` і MCP `feature_status` отримують `stage` і `hints`. Коди виходу ті самі (0 готово, 1 прогалини, 2 помилка), але файл без перевірюваних тверджень і файл з помилками специфікації тепер дають 1. Це зміна контракту: позначити її в tools.md, `resources/keylang-feature/SKILL.md`, визначенні Feature у `CONTEXT.md` і критерії готовності в design §7.6.

**Blocked by:** None (can start immediately)

**Type:** code

**Model:** claude:claude-opus-5-5

**Status:** resolved

**Verify:** `node --test tests/feature-stage.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [x] тести тікета — у новому файлі `tests/feature-stage.test.ts`: Verify запускає його окремо, тож без нього тікет не закриється
- [x] e2e: файл лише з прозою → код 1, прогалина `empty`, `stage idea`
- [x] e2e: невідоме ключове слово під тригером (`- foo bar`) → код 1, прогалина `diagnostic` з K004 і позицією
- [x] e2e: потік із `planned module` без `trigger`, як у шаблоні `keylang new module` → `stage behavior`, підказки `trigger` і `steps`; після реалізації модуля → `done`, код 0 (чинний сценарій не ламається)
- [x] e2e: лише прогалини реалізації → `stage ready`; без прогалин → `done`
- [x] `--format json` стабільний: `stage`, `gaps[].stage`, `hints[]`; MCP `feature_status` повертає той самий об'єкт
- [x] `--help`, tools.md (`feature`, MCP), SKILL.md, `CONTEXT.md` (Feature) і design §7.6 описують стадії й новий критерій

## Comments

- 2026-10-04 (Claude Code, сесія keylang-c9): зроблено без shiftwork. `stage`, `hints` і `stage` кожної прогалини в `src/feature-status.ts`; прогалини `empty` і `diagnostic` (K001–K005 у файлі фічі); підказки `trigger` і `steps` на рядку заголовка потоку (колонка імені потоку, як у K002). Вивід CLI: підказки з префіксом `hint: ` у stdout після прогалин, підсумок `<n> gap(s) · stage <stage>` у stderr. Тести — `tests/feature-stage.test.ts`.
- Рядок `step` з невідомим ID дає лише `diagnostic` K001: друга прогалина `static` на тому самому рядку лише повторювала б її.
- Зміна контракту: тест web «init → new feature → edit → read → map → feature» очікував `done · code 0` для фічі з одного речення — саме цей збій тікет виправляє; тепер `1 gap(s) · code 1`.
