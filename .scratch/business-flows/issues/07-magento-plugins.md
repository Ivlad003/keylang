# 07: Magento: plugins (before/around/after) як перехоплення викликів

**Status:** resolved

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

- [x] фікстура: before + around + after з sortOrder, disabled-плагін не дає ребра
- [x] бенч 03: `placeOrder` показує plugins, які на нього висять (`expect.json`)
- [x] документація в розділі «Magento»

**Межі:** без підтримки плагінів на `__call`/магічних методах (дірка).

## Comments

### Реалізовано (2026-10-08)

- `<plugin name type sortOrder disabled>` у `<type>`/`<virtualType>` будь-якої області. Декларації одного plugin зливаються (пізніша змінює клас, порядок, `disabled`); вимкнений не дає ребер. Кожне ребро виклику публічного нестатичного методу `m` класу `X` чи його підтипу (база, `implements`; plugin на інтерфейсі обгортає реалізації, зокрема виклик через preference — `receiverOf` пам'ятає клас-отримувач і інтерфейс прив'язки) дістає від того ж викликача ребра на `P::beforeM`, `P::aroundM` (перед викликом) і `P::afterM` (після) з `via: "plugin:before|around|after"`, `intercepts` (обгорнута fn), `site`, `scope`, `owner`; порядок — `sortOrder`, далі назва. Ребро на `__construct`, статичний чи непублічний метод не обгортається.
- Флоу: plugin-крок доводиться в `behavior` («through the plugin `coupon` (`P`) on `X` (plugin:around) in `etc/di.xml:5`»), у `shape` — `unverified`. `draft flow --mode algo` показує plugin як крок поруч з обгорнутим викликом з `<!-- keylang:algo via plugin:around <site> -->`. Вузол fn має `interceptedBy`, `explain <id>` друкує рядок `intercepted by`.
- Бенч: у чернетці `placeOrder` є `salesrule.Plugin.CouponUsagesIncrement.CouponUsagesIncrement.aroundSubmit` (обгортає `QuoteManagement::submit`, `SalesRule/etc/di.xml:196`), а також `afterGetActive`/`beforeSave` plugins webapi_rest і `ValidateQuoteOrigOrder::beforeSave`; `expect.json` доповнено цим ID (золотий список 6/6).
- **Не зроблено:** «`trace` — його span справді вкладений» — PHP-trace-адаптера, що бачить виклики plugin через Interceptor, ще немає (тікет 19); статичні ребра plugin trace лише порівнює, як інші. Plugin, оголошений глобально й вимкнений лише в області, лишається з `scope: global` (документовано). Код plugins потрапив у коміт механізму 04 (ті самі `graph.ts`/`bindings.ts`); цей коміт — бенч, `expect.json`, документація й тікет.

