# 10: Magento: точки входу — routes/controllers, webapi, GraphQL, cron, queue, console

**Status:** ready-for-agent

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

- [ ] фікстура з кожним видом; бенч 03: ≥ 95 % маршрутів webapi.xml і всі cron/consumers знайдено
- [ ] мітки детерміновані; невідомий клас у конфігу — точка входу з `unresolved` і дірка
- [ ] документація розділу «Magento»

**Межі:** читання БД-конфігурації (налаштування адмінки) — поза обсягом.

## Comments
