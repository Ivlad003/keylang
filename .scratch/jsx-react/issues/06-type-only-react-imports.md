# 06: Type-only імпорт з `react` не відкриває фабрику; один шлях прив'язок `react`

**Джерело:** HANDOFF-2026-10-02 («Відкриті рішення для людини», п. 3); рішення людини 2026-10-04 — створити й виправити.

**What to build:** `reactFactories` у `src/extract/ts.ts` не відкидає type-only імпорти: з `import type React from "react"` або `import { type createElement } from "react"` виклик `React.createElement(Cart)` / `createElement(Cart)` дає ребро `call`, хоча в рантаймі такого значення немає (перевірено на фікстурі). Тікет 05 уже відкидає `import type` для обгорток (`memo` / `forwardRef` / `lazy`).

- Відкидати type-only імпорти (`import type …`, `import { type X }`, `import type * as React`) для фабрик `createElement` / `jsx` / `jsxs` / `jsxDEV` так само, як для обгорток.
- Звести `reactFactories` і `reactBindings` до одного шляху збору прив'язок `react` / `react/jsx-runtime` / `react/jsx-dev-runtime` (одна чиста функція від кореня файлу), щоб правило type-only не розходилося.
- Повернути перевірки `moduleCalls`, втрачені під час злиття тестів у 05 (звірити з `git show 2d11b25 -- tests/analyzer.test.ts`).

**Blocked by:** None (can start immediately)

**Status:** resolved

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [x] `import type React` / `{ type createElement }` / `import type * as React` з `react` — `React.createElement(Cart)` і `createElement(Cart)` не дають ребра `call` (тест)
- [x] звичайний імпорт і далі дає ребро (регресія)
- [x] один шлях збору прив'язок `react` для обгорток і фабрик
- [x] перевірки `moduleCalls` з тестів до 05 повернуто
- [x] `tests/fixtures/repo.expected` не змінився без причини; `EXTRACTOR_VERSION` не піднято без потреби; карта перегенерована через `node bin/keylang.js map`

## Comments

### 2026-10-04 — реалізація (Claude Opus 5.5)
- `reactBindings(root)` у `src/extract/ts.ts` — єдиний збір прив'язок `react` / `react/jsx-runtime` / `react/jsx-dev-runtime`: `names` (локальне ім'я → експорт React) і `objects` (default / namespace → експорти, доступні як члени). `reactExportOf` називає експорт за callee; `reactWrapperFn` і `factoryCallee` фільтрують його через `REACT_WRAPPERS` / `REACT_FACTORIES`. Лінивий `reactFactories` і тип `ReactFactories` прибрано. `import type …`, `import type * as React` і `import { type X }` відкидаються одним правилом для обгорток і фабрик.
- Тест із WIP очікував ребра `→ null` для type-only фабрик і два однакові ребра `Cart`; насправді виклик у пакет `react` — зовнішній (ребра немає), а однакові ребра зливаються. Тест переписано: ребро `Cart` лише у value-файлі, плюс перевірка фактів (`calls` без доданого `Cart`, `passes` лишаються). На старому екстракторі тест червоний (зайві ребра `Cart` з default / named / ns).
- Повернуто перевірки `moduleCalls` (wrapped / typed / Nest) у тест обгорток.
- `docs/format.md`: фабрика відкривається лише value-імпортом; type-only — звичайний виклик.
- `EXTRACTOR_VERSION` не піднято (як у 01–05: кеш фактів інвалідується хешем коду екстрактора; `snapshotId` ребер не хешує). `tests/fixtures/repo.expected` не змінився. Карту перегенеровано (`keylang/map/extract.md`, `keylang/map-explained/extract.md`).
