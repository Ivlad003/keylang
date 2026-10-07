# 19: Trace на реальних запитах і інтеграційних тестах (PHP/Magento, TS, Python, Rust)

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 09; поза фічею — review-2026-10-06/16, 17 (буфер до exit, fork)

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна)

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Статика на Magento завжди матиме дірки; trace показує, що справді виконалось.

Передумова поза цією фічею: тікети `review-2026-10-06` 16 і 17 (буфер до exit, fork).

- `trace-plan` для точки входу (`keylang trace-plan --entry <id>`): що інструментувати.
- Для кожного trace-адаптера (`src/adapters/trace.ts`, `adapters/python`, `adapters/rust`, `adapters/php`) — спосіб прив'язати запит до флоу (заголовок/кука `X-Keylang-Flow` або змінна середовища). Адаптер `adapters/php` для Magento integration tests (`dev/tests/integration`) і для запитів на локальному стенді (`auto_prepend_file` + заголовок/кука `X-Keylang-Flow: <flow>`, щоб span-и потрапили в потрібний run).
- `draft flow --from-trace <run>`: чернетка флоу зі спостережених викликів (кроки, яких static не бачив, позначені `via trace`).
- Документація: рецепт «записати флоу оформлення замовлення з браузера».


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [ ] фікстура PHP з DI-подібним викликом: static — дірка, trace — `ok`
- [ ] draft з trace дає крок, якого немає в static
- [ ] docs/semantics.md, adapters/php/README

**Межі:** продакшн-трасування з семплюванням — окремо.

## Comments
