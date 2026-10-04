# 03: `createElement` / `jsx` / `jsxs` / `jsxDEV` з React — виклик компонента

**Джерело:** research «Пропозиція» п. 2; «Зіткнення» рядок `createElement`; «Не перевірено» про `jsxDEV`.

**What to build:** Виклик `createElement(Cart, …)`, `jsx(Cart, …)`, `jsxs(Cart, …)`, `jsxDEV(Cart, …)` дає ребро `call` до `Cart`, коли callee резолвиться в імпорт з `react`, `react/jsx-runtime` або `react/jsx-dev-runtime`, а перший аргумент — identifier з великої літери або member. Той самий факт, що й тег із тікета 01: `Page` викликає `Cart` без нового виду ребра. `createElement("div")` — не ребро. Будь-яка інша функція з такою назвою (локальний хелпер, інший пакет) лишається звичайним викликом із `passes`, як зараз. Чинні `passes` для ін'єкції хуків не зникають.

**Blocked by:** 01 <!-- 01 — спільна фікстура; той самий предикат «callee з `react`», який тікети 02 і 03 повинні реалізувати однаково -->

**Status:** resolved

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] Фікстура `.ts` (без JSX) з `import { jsx, jsxs } from "react/jsx-runtime"`, `import { createElement } from "react"`, `import { jsxDEV } from "react/jsx-dev-runtime"`: `Page` викликає `Cart`, `Cart.Item`; `jsx("div")` і `jsx(Fragment)` без ребра до fn `div`
- [ ] Локальний `function createElement(...)` або `import { createElement } from "./dom"`: ребра до першого аргумента немає, виклик і `passes` як до зміни
- [ ] Ін'єкція хука через `passes` у `tests/fixtures/wiring-shop` (або відповідній фікстурі) працює як раніше
- [ ] Регресійна фікстура `.ts` із тікета 01 і `repo.expected` не змінилися; `EXTRACTOR_VERSION` не піднято
- [ ] `npm run typecheck`, `npm test` зелені

## Comments

### Shift 1 — grok grok-4.7 (medium)
- Ended: budget
- Usage: 446915 in / 11252 out tokens, $0.0000, 9 turns
- Time: 1m 30s
- Verify: passed
- Outcome: needs-info: verify gate passed but no shift changed anything: the gate doesn't test this ticket
- Branch kept: shiftwork/jsx-react-03

### Shift 2 — grok grok-4.7 (medium)
- Ended: budget
- Usage: 1218690 in / 36725 out tokens, $0.0000, 16 turns
- Time: 4m 55s (ticket total 4m 55s)
- Verify: passed
- Outcome: needs-info: verify gate passed but no shift changed anything: the gate doesn't test this ticket
- Branch kept: shiftwork/jsx-react-03

### Shift 3 — grok grok-4.7 (medium)
- Ended: budget
- Usage: 2988793 in / 67189 out tokens, $0.0000, 30 turns
- Time: 7m 26s (ticket total 7m 26s)
- Verify: passed
- Outcome: needs-info: verify gate passed but no shift changed anything: the gate doesn't test this ticket
- Branch kept: shiftwork/jsx-react-03

### Shift 4 — grok grok-4.7 (medium)
- Ended: budget
- Usage: 2960384 in / 52740 out tokens, $0.0000, 32 turns
- Time: 7m 43s (ticket total 7m 43s)
- Verify: passed
- Outcome: resolved
- Landed: merged shiftwork/jsx-react-03 into master
