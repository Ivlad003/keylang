# Бенч Magento: базова лінія business-flows

Вимірює цілі [spec business-flows §6](../../.scratch/business-flows/spec.md) на п'яти модулях `magento/magento2` (тікет 03), щоб кожен наступний тікет (32, 04–08, 09–11) показував прогрес числом, а не враженням.

```sh
node bench/magento/run.mjs                 # клон у $XDG_CACHE_HOME/keylang/bench/magento2 (мережа лише тут)
node bench/magento/run.mjs --repo <клон>   # наявний локальний клон magento2, без мережі
node bench/magento/run.mjs --wide          # усі модулі й весь Framework як outside → results-wide.md
node --test tests/bench-magento.test.ts    # формат звіту на фікстурі, без мережі
```

Типовий — **вузький** бенч ([`results.md`](results.md)): лише п'ять модулів і чотири теки Framework на диску. **Широкий** (`--wide`, [`results-wide.md`](results-wide.md), business-flows 40) міряє ті самі п'ять шарів, але з декларацій решти Magento: `git worktree add` кешованого клону в `$XDG_CACHE_HOME/keylang/bench/magento2-wide` з власним non-cone sparse-checkout — увесь `app/code/Magento` і `lib/internal/Magento/Framework` без тек `Test` (тести п'яти модулів лишаються, як у вузькому) і `app/etc/di.xml`; blobs довантажуються в об'єкти кешованого клону (єдиний крок із мережею, ≈ 11 с). У `keylang.json` кожен інший модуль — окремий glob `outside` (`outside` важить більше за шар), Framework — теж; адаптер Magento читає `di.xml` усіх модулів `outside` заради preferences. `node --max-old-space-size=8192`; на 2.4.9 — 13 485 файлів, `map` ≈ 54 с і maxRSS ≈ 1,0–1,3 ГБ (файли `outside` ідуть через повний розбір, з якого лишаються декларації, кешовані за хешем; тіла не потрапляють у граф). `--repo` з `--wide` бере клон як є, без sparse-checkout.

Що робить `run.mjs`:

1. **Клон.** `git clone --depth 1 --filter=blob:none --sparse` тегу `2.4.9` і `git sparse-checkout set` модулів `app/code/Magento/{Checkout,Quote,Sales,SalesRule,Payment}` та підмножини фреймворку `lib/internal/Magento/Framework/{App,Event,Model,Api}`. Увесь `Framework` — ще 6–7 тис. файлів і OOM (рев'ю 2026-10-07), тож береться підмножина, і то не як джерело. Повторний запуск клон не торкає.
2. **`keylang.json` у клоні** (перезаписується): шар на модуль (`checkout`, `quote`, `sales`, `salesrule`, `payment`), `exclude: ["**/Test/**"]`, фреймворк як `outside` — його файли не є дірками й не шаром; з business-flows 40 keylang читає їх лише як декларації (класи, методи, типи результату, `@var` властивостей), тож виклик успадкованого `AbstractModel::getData()` розв'язаний — ребро до модуля файла з `member`; виклики `$objectManager->get(X::class)` і через інтерфейс `outside`, який прив'язує preference, — теж (ADR 0022, `via: object-manager` / `preference`). За ADR 0011 така залежність коду архітектури — K107, тому `check` бенча показує сотні `fail` K107 (одна на пару файлів): це наслідок того, що бенч ставить Framework поза архітектуру, а не регрес; метрики бенча — виклики, не вердикти.
3. **`map`** без кешу фактів під `/usr/bin/time -v` (`node --max-old-space-size=4096`): час і maxRSS; потім **`check --format json`** так само.
4. **`draft flow … --mode algo --print`** для `quote.Model.QuoteManagement.QuoteManagement.placeOrder` і `…submitQuote`.
5. **Метрики** з `.keylang/index.json` через [`bench/lib/metrics.mjs`](../lib/metrics.mjs): частка розв'язаних викликів, дірки за видами й за нормалізованими причинами (top-10), точки входу за видами (поки `n/a` — до тікета 09), кроки чернеток і золотий список з [`expect.json`](expect.json): `found k/n` і бракуючі ID; події `checkout_submit_*` — `n/a` до тікета 08.
6. **[`results.md`](results.md)** (з `--wide` — [`results-wide.md`](results-wide.md)) у детермінованому форматі: усе, крім блоку «Цього запуску» (дата, версії, час, maxRSS, snapshotId), однакове між запусками на тих самих джерелах, тож diff показує лише зміни аналізатора.

`expect.json`: `flow` — тригер, у чернетці якого шукаємо `ids`; `events` — імена подій, які мають стати вузлами `event.*`. ID перевірено на карті `2.4.9`: `OrderManagementInterface::place` реалізує `sales.Model.Service.OrderService.OrderService.place`. Plugin `coupon_uses_increment_plugin` (`SalesRule/etc/di.xml`) обгортає `QuoteManagement::submit`, тож у чернетці `placeOrder` є `salesrule.Plugin.CouponUsagesIncrement.CouponUsagesIncrement.aroundSubmit` (`via: plugin:around`, тікет business-flows 07).

Той самий формат для TS/JS, Python і Rust репозиторіїв друкує `node bench/run.ts` (рядок `resolved … | holes … | entries … ` і `<repo>.metrics.md` у робочій теці): імпортуйте `collectMetrics(snapshot, { drafts, expect })` і `formatReport(metrics, { title, intro, run })` з `bench/lib/metrics.mjs` (типи — `metrics.d.mts`).
