# 30: Цільовий стек: Salesforce Commerce Cloud (SFRA-картриджі, PWA Kit)

**Status:** ready-for-agent

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

- [ ] фікстура SFRA: два картриджі з перекриттям, `*/cartridge` резолвиться в правильний
- [ ] точки входу контролерів
- [ ] docs/snapshot.md «SFCC»

**Межі:** —

## Comments
