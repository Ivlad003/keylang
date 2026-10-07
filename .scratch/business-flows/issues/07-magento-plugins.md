# 07: Magento: plugins (before/around/after) як перехоплення викликів

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 04

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

`<type name="X"><plugin name="p" type="P"/></type>` у `di.xml`: кожен публічний метод `m` класу X має обгортки `P::beforeM`, `P::aroundM`, `P::afterM`. У цих модулях 69 plugins — логіка, яку люди при міграції гублять першою.

- Виклик `X::m` (прямий або через прив'язку) → додаткові ребра `call` на методи плагіна з `via: plugin:before|around|after`, порядок за `sortOrder`; `disabled="true"` знімає.
- Плагін на інтерфейс застосовується до реалізацій.
- Флоу й `draft flow`: плагін показується як крок-обгортка з позначкою; `trace` — його span справді вкладений.
- Звіт `explain <id>`: розділ «intercepted by».

## Критерії готовності

- [ ] фікстура: before + around + after з sortOrder, disabled-плагін не дає ребра
- [ ] бенч 03: `placeOrder` показує plugins, які на нього висять (`expect.json`)
- [ ] документація в розділі «Magento»

**Межі:** без підтримки плагінів на `__call`/магічних методах (дірка).

## Comments
