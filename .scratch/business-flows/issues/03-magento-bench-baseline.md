# 03: Бенч на Magento: базова лінія й метрики успіху

**Status:** ready-for-agent

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

- [ ] `node bench/magento/run.mjs` на чистій машині дає `results.md` з усіма метриками; повторний запуск — ті самі числа (крім часу)
- [ ] базова лінія закомічена: ≈17 % розв'язаних викликів, порожній `placeOrder`
- [ ] `bench/results.md` посилається на новий бенч

**Межі:** вимірювання, без змін аналізатора.

## Comments

### Рев'ю плану (2026-10-07)

`lib/internal/Magento/Framework` — це ще ≈ 6–7 тис. PHP-файлів. Рев'ю 2026-10-05 зафіксувало ≈ 0,1 МБ heap на файл і OOM на 5000 файлах при 320 МБ heap; п'ять модулів уже беруть 610 МБ. **Рішення:** Framework брати не як джерело, а через `outside` (код поза архітектурою, K107 не вмикати) або вибірково (лише `Framework/App`, `Framework/Event`, `Framework/Model`), і зафіксувати в бенчі `--max-old-space-size=4096` і maxRSS як метрику. Бенч має також запускатися на вже наявному локальному клоні (`--repo <dir>`), щоб не тягнути мережу щоразу.
