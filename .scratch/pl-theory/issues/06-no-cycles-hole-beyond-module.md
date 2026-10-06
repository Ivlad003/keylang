# 06: `no-cycles` під модулем: прогалина в досяжному модулі дає `unverified`, а не `ok`

**Джерело:** research-pl §5 Р-4; знахідка 2; рішення Q6 (spec); spec «Виправлення дослідження», Р-4: контрприклад `no-cycles` під модулем

**What to build:** Відтворення (перевірено 2026-09-29):
- `keylang.json` має шари `app` і `infra`, а `keylang/rules.md` — рядки `- module app.a` / `  - no-cycles`;
- `src/app/a.ts` і `src/infra/b.ts` імпортують одне одного;
- `check` дає K105 `app.a → infra.b → app.a` на `keylang/rules.md:4`.

З `exclude: ["src/infra/b.ts"]` той самий рядок отримує `ok` «convergence: no import cycle through `app.a`», код 0. Так само буває, коли `b.ts` замість імпорту `a.ts` має нерозв'язаний `import { m } from "./missing.ts"`. Менше інформації перемкнуло `fail` на `ok`.

Причина: коли циклу не знайдено, прогалину шукають лише серед модулів під `app.a` (src/rules.ts:366). Проте цикл через модуль може проходити будь-якими модулями, досяжними з нього.

Нова область `no-cycles` під модулем (Q6):
- сам модуль і його підмодулі;
- усі файли-модулі, досяжні з них відомими ребрами `import`/`re-export`, тобто тим самим графом, на якому правило шукає SCC;
- нечитабельні теки в цій області (як у `scopeHole`, src/rules.ts:166).

Прогалина рівня залежностей в області дає `unverified` з назвою й позицією. Модуль, недосяжний з області, на вердикт не впливає.

Запис `unassigned-file` («outside any layer», src/graph.ts:297) в області `no-cycles` під модулем прогалиною не вважається. Ребра такого файла відомі, а інакше кожен досяжний файл поза шарами давав би новий `unverified`. Так само вирішено для `layers` у 07. Глобальний `no-cycles` зараз рахує цей запис прогалиною: він дає `unverified … outside any layer` (перевірено; `DEPENDENCY_HOLES`, src/rules.ts:386). Тікет цього не змінює. На самому репозиторії записів `unassigned-file` немає, тож вердикти `check` репозиторію не змінюються (перевірено).

Виправлення робиться в поточному `rules.ts`, до міграції на SpecIR: 19 заблокований цим тікетом і зберігає поведінку. 07 змінює сусідню ділянку того самого `evaluateOnSnapshot`, тож ці тікети зливають по черзі. Якщо 05 уже злито, цей тікет знімає `todo` з підтесту свого випадку в tests/metamorphic.test.ts.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Контракт:** змінюється семантика: частина `ok` для `no-cycles` під модулем стає `unverified`, тож `check --strict` на таких репозиторіях дає 1 замість 0. Це несумісна зміна (виправлення надійності), її записують у «Несумісні зміни» spec. Форма JSON не змінюється.

- [x] Мінімальна фікстура з `exclude: ["src/infra/b.ts"]`: `check` дає код 0. У `check --format json` результат `no-cycles` з `area: "app.a"` має `verdict: "unverified"`, а evidence містить `src/infra/b.ts:1:1`. `check --strict` дає код 1.
- [x] Та сама фікстура без `exclude` дає K105 `app.a → infra.b → app.a` (регресія).
- [x] `src/app/a.ts` імпортує `src/infra/b.ts`, а `b.ts` має лише нерозв'язаний `./missing.ts`. Результат — `unverified` з позицією нерозв'язаного імпорту.
- [x] Прогалина в недосяжному модулі лишає `ok`: `a.ts` → `b.ts` без циклу, `src/infra/c.ts` з `import "./missing.ts"`, який ніхто не імпортує. Файл поза шарами, досяжний з `app.a`, без інших прогалин теж лишає `ok`. Наявний тест tests/core.test.ts:75 зелений без змін очікувань.
- [x] semantics.md §7, пункт «Цикли» (docs/format.md:265), визначає область `no-cycles` під модулем через досяжність і каже, що `unassigned-file` для неї прогалиною не є. Якщо 05 злито, `todo` цього випадку в tests/metamorphic.test.ts знято.
- [ ] `npm run typecheck` і `npm test` зелені. `node bin/keylang.js map` виконано, diff переглянуто, зокрема карту з поясненнями (`explain.map` увімкнено). `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/rules.ts`, `tests/core.test.ts`, `docs/format.md`; за умови 05 — `tests/metamorphic.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; src/rules.ts; tests/rules-area.test.ts «no-cycles under a module counts a hole in a module it imports» (exclude → unverified з src/infra/b.ts:1:1, --strict = 1; нерозв'язаний ./missing.ts; недосяжна прогалина лишає ok); tests/metamorphic.test.ts «excluding the far side of a cycle is unverified, not ok» без todo; docs/semantics.md §7 «Цикли». Примітка: проба 2026-10-01 — якщо виключений файл циклу лежить поза всіма шарами (`src/misc/b.ts`, шари лише `app`), `exclude` досі дає K105 fail → ok; та сама причина, що й у випадку 2 тікета 07 (виключений файл поза шарами не стає прогалиною), — див. коментар у 07.
