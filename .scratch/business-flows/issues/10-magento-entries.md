# 10: Magento: точки входу — routes/controllers, webapi, GraphQL, cron, queue, console

**Status:** resolved

**Type:** code

**Blocked by:** 06, 09

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

- `etc/frontend|adminhtml/routes.xml` (`frontName`) + `Controller/<Path>/<Action>.php::execute` → `route` з міткою `GET|POST /frontName/path/action` (метод — з `HttpGetActionInterface`/`HttpPostActionInterface`).
- `etc/webapi.xml`: `<route url method><service class method>` → `rest` на метод **реалізації** через прив'язку (06), мітка `POST /V1/carts/mine/order`, ресурси ACL у мітці.
- `etc/schema.graphqls` `@resolver(class: …)` → `graphql`.
- `etc/crontab.xml` `<job instance method>` + розклад → `cron` (розклад у мітці).
- `etc/queue_consumer.xml` `handler="Class::method"` → `consumer`.
- `di.xml` `Magento\Framework\Console\CommandList` arguments → `cli` (`Command::execute`).
- Observers з 08 → `observer`.

## Критерії готовності

- [x] фікстура з кожним видом; бенч 03: ≥ 95 % маршрутів webapi.xml і всі cron/consumers знайдено
- [x] мітки детерміновані; невідомий клас у конфігу — точка входу з `unresolved` і дірка
- [x] документація розділу «Magento»

**Межі:** читання БД-конфігурації (налаштування адмінки) — поза обсягом.

## Comments

### Реалізовано (2026-10-08)

- Адаптер Magento (версія `2`) читає ще `etc/<area>/routes.xml`, `etc/webapi.xml`, `etc/crontab.xml`, `etc/queue_consumer.xml`, `etc/schema.graphqls` (невеликий сканер SDL), `events.xml` і `CommandList` у `di.xml`; усі — входи `snapshotId` і кешу фактів. Точки входу (`entries`, `framework: "magento"`, `source` — рядок конфігу): `route` — класи `Controller/<Path>/<Action>.php` (в `adminhtml` — `Controller/Adminhtml/…`, мітка з `/admin`) модуля, який називає `routes.xml` (теку дає `registration.php`), мітка `GET|POST /frontName/path/action` за `Http*ActionInterface` класу чи бази, `*` без них; `rest` — метод **реалізації** через preference `webapi_rest`/глобальний, мітка `POST /V1/… [ресурси ACL]`; `graphql` — `Type.field` → `C::resolve`; `cron` — `<job> <розклад>` (розклад останнім, як читає `every`) або `<job> (config_path …)`; `consumer` — `handler="C::m"` (без нього — `process` `consumerInstance`); `cli` — `<item>` `commands` → `C::execute`; `observer` — з 08. `virtualType` — його клас.
- Невідомий клас, інтерфейс без preference, метод, якого немає, — точка входу з `unresolved` (причина) і дірка `unresolved-binding` на рядку конфігу; `keylang entries` дописує `unresolved: …` у рядок.
- Тести: `tests/frameworks-magento.test.ts` (кожен вид, мітки, `unresolved`, детермінованість, `trigger cron` + `every` з розкладу), `tests/entries.test.ts` (`--json`, `--kind rest` з `unresolved`), `tests/web.test.ts` (види в `/api/views`).
- Бенч: `rest` 133/133 (усі маршрути webapi.xml, жодного `unresolved`), `cron` 15/15, `consumer` 3/3, `route` 186, `observer` 58 (6 — `unresolved`: класи `lib/internal/Magento/Framework` поза аналізом і модуль `SalesSequence` поза sparse-checkout), `graphql` і `cli` — 0 (у п'яти модулях бенча немає `schema.graphqls` і команд).
