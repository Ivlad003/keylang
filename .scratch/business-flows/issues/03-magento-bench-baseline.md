# 03: Бенч на Magento: базова лінія й метрики успіху

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `node --test tests/bench-magento.test.ts`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Зафіксувати вимірювані цілі spec §6, щоб кожен наступний тікет показував прогрес.

- `bench/magento/run.mjs`: sparse-clone `magento/magento2` (тег фіксований, напр. `2.4.8`) у кеш `$XDG_CACHE_HOME/keylang/bench/`, модулі Checkout, Quote, Sales, SalesRule, Payment **і** `lib/internal/Magento/Framework` (щоб імпорти фреймворку не були штучними дірками), `keylang.json` як у spec §2 + `exclude: ["**/Test/**"]`.
- Метрики в `bench/magento/results.md` (детермінований формат): частка розв'язаних викликів, дірки за видами й причинами (top-10), кількість точок входу за видами (коли з'явиться тікет 09), кроки чернетки `placeOrder` і `submitQuote`, наявність «золотих» ID (spec §6), час і пам'ять `map`/`check`.
- Золотий список у `bench/magento/expect.json`: ID, які мають бути у флоу `placeOrder`; бенч друкує `found k/n` і бракуючі.
- Мережа потрібна лише бенчу; у `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) — лише тест формату звіту на маленькій фікстурі (`tests/bench-magento.test.ts`, без мережі).


**Інші мови:** ті самі метрики (розв'язані виклики, точки входу, флоу) додати в наявний `bench/` для TS/Python/Rust-репозиторіїв, щоб прогрес business-flows було видно не лише на PHP.

## Критерії готовності

- [x] `node bench/magento/run.mjs` на чистій машині дає `results.md` з усіма метриками; повторний запуск — ті самі числа (крім часу)
- [x] базова лінія закомічена: ≈17 % розв'язаних викликів, порожній `placeOrder`
- [x] `bench/results.md` посилається на новий бенч

**Межі:** вимірювання, без змін аналізатора.

## Comments

### Рев'ю плану (2026-10-07)

`lib/internal/Magento/Framework` — це ще ≈ 6–7 тис. PHP-файлів. Рев'ю 2026-10-05 зафіксувало ≈ 0,1 МБ heap на файл і OOM на 5000 файлах при 320 МБ heap; п'ять модулів уже беруть 610 МБ. **Рішення:** Framework брати не як джерело, а через `outside` (код поза архітектурою, K107 не вмикати) або вибірково (лише `Framework/App`, `Framework/Event`, `Framework/Model`), і зафіксувати в бенчі `--max-old-space-size=4096` і maxRSS як метрику. Бенч має також запускатися на вже наявному локальному клоні (`--repo <dir>`), щоб не тягнути мережу щоразу.

### Зроблено (2026-10-07)

- `bench/magento/run.mjs`: sparse-clone `magento/magento2` тегу **`2.4.9`** (найновіший стабільний 2.4.x на 2026-10-07; `2.4.9-beta1` і `-alpha*` пропущено) у `$XDG_CACHE_HOME/keylang/bench/magento2` — неглибокий клон з `--filter=blob:none --sparse` + `sparse-checkout set` п'яти модулів і `Framework/{App,Event,Model,Api}`; `--repo <dir>` бере локальний клон без мережі, наявний кеш теж не тягне мережу. `keylang.json` у клоні — шар на модуль, `exclude: ["**/Test/**"]`, фреймворк як `outside` (рішення рев'ю: не джерело). `map` без кешу фактів під `/usr/bin/time -v` з `--max-old-space-size=4096` (без `time` — `hrtime`, maxRSS `n/a`), далі `check --format json` і два `draft flow --mode algo --print`.
- `bench/lib/metrics.mjs` (+ `metrics.d.mts`): `collectMetrics` / `formatReport` / `summaryLine` — спільний формат для Magento і для `bench/run.ts` (TS/JS, Python, Rust: рядок `resolved … | holes … | entries …` і `<repo>.metrics.md`). Пункт «Інші мови» закрито цим хуком.
- `bench/magento/expect.json`: 5 ID + 2 події. `OrderManagementInterface::place` у карті — `sales.Model.Service.OrderService.OrderService.place` (перевірено). Події до тікета 08 друкуються як `n/a`.
- `tests/bench-magento.test.ts` на фікстурі `tests/fixtures/bench-magento/index.json`: форма Markdown, золотий список, `entries`/`event.*` коли є, детермінізм за порядком `coverage`.
- **Базова лінія** (`bench/magento/results.md`, keylang `661886b`): розв'язано **17,7 %** (4892 з 27 703); `placeOrder` — 1 крок (порожній), `submitQuote` — 68 кроків (у spec §2 було 20 — ефект тікета 32); золотий список `found 0/5` (усі ID є в карті; `validateQuote`/`validateOrder`/`submitQuote` є лише в чернетці `submitQuote`); `entries` і події — `n/a`; `map` 5,8 с, maxRSS 705 МБ; `check` 1,8 с. Два запуски поспіль відрізняються лише блоком «Цього запуску».
- Спостереження для наступних тікетів: імпорти `Magento\Framework\*` з модулів лишаються `unresolved-import` (2327) навіть для файлів, що є в клоні як `outside`, — PHP-резолвер знає імена лише з проіндексованих файлів, а `outside` не індексується; це не дірка аналізу флоу, але частка нерозв'язаних імпортів на Magento не впаде, доки `outside`-файли не дадуть хоча б імена класів (або поки Framework не стане шаром після оптимізації пам'яті).
