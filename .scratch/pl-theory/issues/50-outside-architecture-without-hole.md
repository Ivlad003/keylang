# 50: Явний спосіб вивести файли «поза архітектуру» без прогалини

**Джерело:** рішення людини 2026-10-04 щодо pl-theory/07: семантику прийнято (виключений файл поза всіма шарами — прогалина), а спосіб вивести скрипти з архітектури без прогалини — окремий тікет.

**What to build:** Після 07 явно виключений через `exclude` файл поза всіма шарами стає opaque-модулем у `unassigned`, тож `layers` і глобальний `no-cycles` стають `unverified`. На самому keylang це 25 файлів (`bench/**`, `design/**`, `editors/**`, `examples/**`, `scripts/**`), і `check --strict` = 1 назавжди. Потрібен явний, видимий у конфігу спосіб сказати «цей код не є частиною архітектури», після якого правила не втрачають вердикт, а карта й index чесно показують, що файли виведено з аналізу (не мовчазно).

Варіанти для рішення (обрати перед реалізацією): окреме поле `keylang.json` (напр. `outside: [...]`) з іншою семантикою, ніж `exclude`; або позначка в `exclude`; або правило в `keylang/rules.md`. Треба визначити, чи імпорт з архітектурного коду у такий файл — порушення, прогалина чи дозволено.

**Blocked by:** 07

**Status:** resolved

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check --strict`

- [x] рішення щодо форми й семантики записано (ADR або spec)
- [x] на фікстурі файл «поза архітектурою» не робить `layers` / `no-cycles` `unverified`; `exclude` поводиться як після 07
- [x] карта й index показують виведені файли явно
- [x] keylang переведено на новий механізм; `check --strict` на самому репозиторії = 0, якщо інших прогалин немає

## Comments

- 2026-10-04 — рішення людини: нове поле `outside: [glob…]` у `keylang.json` поруч з `exclude` (не позначка в `exclude` і не рядок у `rules.md`). Файли `outside` видно в карті й index як виведені з аналізу; `layers`, глобальний `no-cycles` і `deny` над ними не стають `unverified`. Імпорт з архітектурного коду (файл у шарі) в `outside`-файл — порушення (`fail`): продукт не залежить від скриптів. Імпорт з `outside` в архітектурний код дозволено. keylang переводить `bench/**`, `design/**`, `editors/**`, `examples/**`, `scripts/**` на `outside`.
- 2026-10-04 — зроблено. `outside: [glob…]` у `keylang.json` (валідація як в `exclude`: `outside`, `outside[i]`). Файл `outside` — opaque-модуль синтетичного шару `outside` (`<dir>/map/outside.md`, `<!-- outside -->`), у `coverage` — `outside-file` (не прогалина), `manifest.config.outside` у `snapshotId`. Ребро з модуля шару чи `unassigned` у файл `outside` — K107 `fail` (критерій `outside`, одна на пару файлів). Рішення — ADR 0011, семантика — format.md §7 (K107, `k107`) і §11. Тести: `tests/outside.test.ts` (exclude → `unverified` і `--strict` 1, outside → `ok` і `--strict` 0; карта й index; K107; валідація). Припущення: `unassigned` теж код архітектури, тож його імпорт в `outside` — K107; `outside` переважає шари й `exclude`, вбудований список (тести) переважає `outside`; ім'я шару `outside` тепер зарезервоване (несумісно для конфігів із таким шаром); схема знімка лишається 7 (зміна адитивна). keylang переведено: `check --strict` = 0 (0 unverified, 71 ok) після `npm test`, який пише звіт тестів і trace; без них лишаються лише `tests`/`trace` `unverified` потоків.
