# 39: PWA Kit / Composable Storefront: ccExtensibility overrides і маршрути

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** розбиття тікета 31 (рішення автора 2026-10-07: business-flows — для всіх мов проєкту); [ADR 0022](../../../docs/adr/0022-framework-facts.md); зразок — адаптери `src/frameworks/magento.ts`, `src/frameworks/sfcc.ts`, `src/framework-entries.ts`

## What to build

Адаптер фреймворку (TS) за інтерфейсом `src/frameworks/adapter.ts`: автовиявлення (залежність у маніфесті + характерні файли), поле `frameworks` у `keylang.json` перевизначає; конфіги — входи знімка; ребра — `call` з `via` і `site`; точки входу — `snapshot.entries`; події — вузли `events.*` (як у Magento, тікет 08); що не прочитано — дірка з причиною, нічого не вгадується з імен.

Залишок тікета 30 (2026-10-08):
1. `@salesforce/retail-react-app/app/…` має резолвитись у `overrides/app/…`, якщо там є файл (`ccExtensibility.overridesDir` у `package.json`), інакше — у базовий пакет; зараз ребро хибно йде в external без дірки.
2. `^@salesforce/retail-react-app/…` — явно базовий пакет (external), не unresolved.
3. Точки входу: масив `routes` у `routes.jsx` (`{ path, component }` → `route` з міткою шляху на компонент), `ssr.js` handler і `app.get('*', runtime.render)` → `route` з приміткою.

## Критерії готовності

- [ ] фікстура з типовим шаблоном фреймворку; тести через справжній CLI: точки входу кожного виду, ребра через `via` (behavior ok / shape unverified), `deny` бачить ребра конфігу, `frameworks: []` вимикає (ok/fail → лише unverified, metamorphic)
- [ ] `flows discover` дає флоу для точок входу; `coverage` показує, що лишилось сліпим
- [ ] `docs/snapshot.md` розділ «Фреймворки: …», `llm.txt` один рядок

**Межі:** лише цей фреймворк.

## Comments
