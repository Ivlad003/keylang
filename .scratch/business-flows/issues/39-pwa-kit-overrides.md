# 39: PWA Kit / Composable Storefront: ccExtensibility overrides і маршрути

**Status:** resolved

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

- [x] фікстура з типовим шаблоном фреймворку; тести через справжній CLI: точки входу кожного виду, ребра через `via` (behavior ok / shape unverified), `deny` бачить ребра конфігу, `frameworks: []` вимикає (ok/fail → лише unverified, metamorphic)
- [x] `flows discover` дає флоу для точок входу; `coverage` показує, що лишилось сліпим
- [x] `docs/snapshot.md` розділ «Фреймворки: …», `llm.txt` один рядок

**Межі:** лише цей фреймворк.

## Comments

### Реалізовано (2026-10-08)

- **Адаптер** `pwa-kit` (`src/frameworks/pwa-kit.ts`): проєкт — тека, чий `package.json` пише `ccExtensibility` або залежить від `@salesforce/pwa-kit-runtime` (корінь і теки над `app/routes.*`/`app/ssr.*`); конфіги — `package.json` проєкту, `routes.*` і `ssr.*` в `app/` і `<overridesDir>/app/`. JSON, що не розбирається, — дірка з причиною.
- **Резолвінг** (`src/imports.ts`, `templateImport`): `<extends>/app/x` — `<overridesDir>/app/x` проєкту найближчого `package.json` з `ccExtensibility`, коли файл є, інакше зовнішній пакет шаблону; `^<extends>/…` — зовнішній пакет завжди; перекриття, що імпортує власний шлях, — база. `frameworks` без `"pwa-kit"` вимикає резолвінг (`src/frontends.ts`), як `sfcc`. Пункти 1–2 залишку тікета 30 закрито.
- **Точки входу** (`src/framework-entries.ts`): екстрактор записує факт `page` — `{ path, component }` масиву у файлі `routes.{js,jsx,ts,tsx}` з `source` для лінивого `loadable`/`lazy(() => import('…'))`; адаптер дає `route` з міткою шляху на fn компонента (лінивий — default-експорт модуля `import()`; компонент з пакета — модуль `routes` з `note`). `app.get('*', h)` тепер теж факт `route` (шлях `*`); у `ssr.*` — `route` `GET *` на модулі сервера з `note`, експортований `get` — `route` `ssr handler` з `note`. Пункт 3 закрито; `getProps`/`getTemplateName` сторінок точками входу не стали.
- **Тести:** `tests/frameworks-pwa-kit.test.ts` (5, через CLI): перекриття виграє, `^` — зовнішній, шлях без перекриття — зовнішній, видалене перекриття змінює ребро й `snapshotId`; маршрути `routes.jsx` (ім'я, лінивий, з пакета) і `ssr.js`; `deny` бачить залежність, яку дає лише перекриття; `frameworks: []` metamorphic; `flows discover` і `coverage`.
- **Docs:** `docs/snapshot.md` «Фреймворки: PWA Kit» (абзац про PWA Kit у «SFCC» тепер посилається туди), `llm.txt` рядок.
