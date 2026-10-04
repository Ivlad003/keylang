# JSX як звичайний виклик

**Джерело:** `docs/research-jsx-react.md` (2026-09-29). Нотатка — єдина специфікація фічі; тут лише межі.

**Мета.** Файл `.tsx` / `.jsx` отримує ребра `call` від функції, у тілі якої стоїть тег компонента, до цього компонента. Знімок Express/Nest на `.ts` без JSX не змінюється: ті самі декларації, ті самі ребра, той самий `snapshotId`.

**Інваріанти для всіх тікетів.**
- Нове ребро народжується лише з вузла, який граматика вже назвала JSX. Граматика `typescript` таких вузлів не має; запит JSX для неї не компілюється й не створюється.
- Вид ребра `call`, граматика мови, коди діагностик, `SNAPSHOT_SCHEMA`, `EXTRACTOR_VERSION` і версії wasm не змінюються.
- Обгортки й фабрики React впізнаються за резолвом імпорту з `react` / `react/jsx-runtime`, не за текстом імені.
- Імена fn не змінюються; пункт 4 нотатки вже реалізовано.

**Поза обсягом.** Props, state, context, правила хуків, Storybook, `"use client"` / `"use server"`, ребро layout→page з файлової системи, `<Route component={Cart} />`.

Тікети: `issues/`.

<!-- shiftwork:tickets:start -->
| NN | title | status | last route |
| -- | ----- | ------ | ---------- |
| 01 | Тег JSX компонента — ребро `call` у `.tsx` і `.jsx` | resolved |  |
| 02 | `memo` / `forwardRef` / `lazy` з `react` розгортаються у fn | resolved | grok-4.7 |
| 03 | `createElement` / `jsx` / `jsxs` / `jsxDEV` з React — виклик компонента | resolved | grok-4.7 |
| 04 | Оборотне кодування сегментів `(shop)` і `[id]` в ID модуля | needs-info | grok-4.7 |
| 05 | Доробки після ревʼю тікета 02 (обгортки React) | resolved | grok-4.7 |
<!-- shiftwork:tickets:end -->
