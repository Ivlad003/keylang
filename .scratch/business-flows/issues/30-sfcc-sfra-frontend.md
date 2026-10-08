# 30: Цільовий стек: Salesforce Commerce Cloud (SFRA-картриджі, PWA Kit)

**Status:** resolved

**Type:** code

**Blocked by:** 01, 09

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Щоб перевіряти новий стек міграції.

- SFRA: резолвінг `require('*/cartridge/scripts/…')` і `~/cartridge/…` за cartridge path (`cartridge_path` з `dw.json`/конфігу або `keylang.json` `sfcc.cartridgePath`), `module.superModule`.
- Точки входу: `server.get|post|use('Name', …)` у `controllers/*.js` → `route` `Controller-Name`; `hooks.json` → `observer`-подібні гілки; `jobs` (steptypes.json) → `cron`.
- PWA Kit / Composable Storefront — звичайний TS/React (перевірити на шаблоні `retail-react-app`, записати дірки).
- Apex (B2B Commerce) — явно «не підтримується» в документації.

## Критерії готовності

- [x] фікстура SFRA: два картриджі з перекриттям, `*/cartridge` резолвиться в правильний
- [x] точки входу контролерів
- [x] docs/snapshot.md «SFCC»

**Межі:** —

## Comments

### Реалізовано (2026-10-08)

- **Конфіг.** `keylang.json` `sfcc: { cartridgePath: string[] }` (`src/config.ts`; не масив назв — помилка з кодом 2). Без нього — підказка `dw.json` (`cartridgePath`/`cartridge_path` як `a:b` чи масив, інакше список `cartridge`) чи кореневого `package.json` (`sfcc.cartridgePath`/`cartridgePath`), інакше всі картриджі за назвою — здогад.
- **Резолвінг** (`src/frameworks/cartridges.ts`, підключено в `ImportResolver`): `*/cartridge/…` — перший картридж шляху з файлом; `~/cartridge/…` — власний картридж; `<картридж>/cartridge/…` — названий; `module.superModule` — той самий шлях у наступному картриджі (екстрактор `src/extract/ts.ts` записує його як імпорт зі specifier `module.superModule`; ребро — звичайний `import`, без `via`, тож `base.f()` резолвиться в базовий картридж, а `deny` бачить залежність); `dw/…` — `external.dw`; голе ім'я — спершу тека `cartridges/modules` (`require('server')`). Порядок і його джерело — вхід резолвера, тобто `snapshotId`. Здогаданий порядок, який вирішив ребро (`*/cartridge` з ≥2 відповідями, кожен `superModule`), — запис `coverage` `unsupported` «cartridge path guessed: …» модуля, що вимагає: `deny` над ним — `unverified`.
- **Точки входу** (`src/frameworks/sfcc.ts`, адаптер форми ADR 0022 `{ name, detect(root), files, facts(...) → { entries, holes, inputs, warnings } }`; реєстрація — `FRAMEWORK_ADAPTERS` у `src/map.ts`): `server.get|post|use|append|prepend|replace('<Action>', …, h)` у `controllers/<Name>.js` → `route` `<Name>-<Action>`, `method` `GET`/`POST`, `id` — fn останнього аргументу (ім'я чи `helpers.f` через імпорт), для обробника на місці — модуль контролера і `note`; `hooks.json` → `observer`; `steptypes.json` → `cron`. `EntryPoint` отримав необов'язкові `method` і `note`. Скрипт хука/кроку, якого немає, — `unsupported` у файлі конфігу.
- **Тести:** `tests/frameworks-sfcc.test.ts` через CLI — два картриджі з перекриттям (`app_custom` перед `app_storefront_base`), `*/cartridge` за заданим і оберненим шляхом, `~/cartridge`, `superModule` (і його відсутність в останньому картриджі), `dw/`, `modules/server`, точки входу контролерів/хуків/кроків, `deny base custom` → K102 через `*/cartridge`, здогад і підказка `dw.json`, невалідний конфіг.
- **Docs:** `docs/snapshot.md` «Фреймворки: SFCC»; Apex (B2B Commerce) — явно «не підтримується».
- **Узгодження:** адаптер Magento (`src/frameworks/adapter.ts`) на момент роботи ще не злився в master; SFCC має ту саму форму у власному файлі й реєструється одним рядком у `src/map.ts` — при злитті перенести в реєстр адаптерів.

### PWA Kit / Composable Storefront: дірки (2026-10-08)

Мінімальна фікстура за формою `retail-react-app` з template extensibility (`package.json` `ccExtensibility: { extends: "@salesforce/retail-react-app", overridesDir: "overrides" }`, `overrides/app/{routes.jsx, ssr.js, main.jsx, pages/home, components/{section,seo}}`, без мережі й `node_modules`), `keylang map` з вгаданими шарами: 7 файлів, 15 залежностей, 1 нерезолвлений імпорт, 1 динамічний виклик. Що лишається:

1. **Перекриття шаблону мовчки йде в зовнішній пакет.** `import Seo from '@salesforce/retail-react-app/app/components/seo'` дає ребро в `external.salesforce-retail-react-app`, хоча `overrides/app/components/seo/index.jsx` є — збирач PWA Kit підставляє перекриття. Дірки немає, ребро хибне. Потрібен резолвер `ccExtensibility` (перекриття → файл, інакше зовнішній пакет) — кандидат у тікет 31.
2. **`^@salesforce/retail-react-app/…`** (база в обхід перекриття) — `unresolved-import`, і виклик `<BaseSection />` через нього — `dynamic-call`. Мав би бути зовнішнім пакетом.
3. **Точок входу немає:** масив маршрутів `routes.jsx` (`{path: '/', component: Home}` + `loadable(() => import(...))`), обробник Managed Runtime (`export const get = handler` у `ssr.js`), `app.get('*', runtime.render)` (шлях не з `/`) і `app.get('/callback', (_, res) => …)` (обробник на місці) записів не дають. `getProps`/`getTemplateName` сторінок — теж.
4. Решта — звичайний React/TS: імпорти `@salesforce/commerce-sdk-react`, `@chakra-ui/react`, `@salesforce/pwa-kit-*` — зовнішні, як і мають бути; хуки SDK (`useProductSearch`) — зовнішні виклики.

