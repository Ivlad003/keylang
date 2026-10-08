# Бенч Magento: базова лінія business-flows

[magento/magento2](https://github.com/magento/magento2) тег `2.4.9` (коміт `755e34dd`), sparse-checkout: модулі `Checkout`, `Quote`, `Sales`, `SalesRule`, `Payment` як шари, `lib/internal/Magento/Framework/{App,Event,Model,Api}` як `outside`, `exclude: ["**/Test/**"]`.

Як відтворити: `node bench/magento/run.mjs [--repo <клон>]` — див. [README](README.md). Цей файл пише бенч; змінюється тільки блок «Цього запуску».

`check --format json`: 0 fail, 0 unverified, 0 ok, 0 warning; записів coverage 21949. `map`: 2327 попереджень.

`draft flow quote.Model.QuoteManagement.QuoteManagement.placeOrder --mode algo --print`: кроків 45 (разом із тригером).
`draft flow quote.Model.QuoteManagement.QuoteManagement.submitQuote --mode algo --print`: кроків 119 (разом із тригером).

## Розмір

| Файли | Модулі | fn | Типи | Залежності | Нерозв'язані імпорти |
|---:|---:|---:|---:|---:|---:|
| 2141 | 2656 | 7099 | 276 | 3241 | 2327 |

## Виклики

Розв'язано **21.5 %** (5962 з 27703; ціль spec §6 — ≥ 60 %).

| resolved | external | dynamic | unresolved |
|---:|---:|---:|---:|
| 5962 | 2706 | 13352 | 5683 |

## Дірки за видами

| Вид | Кількість |
|---|---:|
| `dynamic-call` | 13348 |
| `unresolved-call` | 5683 |
| `unresolved-import` | 2327 |
| `outside-file` | 508 |
| `skipped-file` | 42 |
| `unresolved-binding` | 22 |
| `unsupported` | 12 |
| `ambiguous-binding` | 4 |
| `unassigned-file` | 3 |

## Дірки за причинами (top-10 з 21370)

Імена в зворотних лапках зведено до `X`.

| # | Причина | Кількість |
|---:|---|---:|
| 1 | dynamic-call: call through a local value `X` | 7625 |
| 2 | unresolved-call: unresolved call `X` | 5674 |
| 3 | dynamic-call: call through an expression `X` | 4066 |
| 4 | unresolved-import: unresolved import `X` | 2327 |
| 5 | dynamic-call: call through `X` of a function value `X` | 950 |
| 6 | dynamic-call: call through `X` of `X` | 453 |
| 7 | dynamic-call: call through an interface `X` | 82 |
| 8 | dynamic-call: bound to opaque `X` by `X` (app/code/Magento/Quote/etc/di.xml:18:5): `X` may be declared by a base keylang has not read | 35 |
| 9 | dynamic-call: bound to opaque `X` by `X` (app/code/Magento/Quote/etc/di.xml:16:5): `X` may be declared by a base keylang has not read | 31 |
| 10 | dynamic-call: bound to opaque `X` by `X` (app/code/Magento/Sales/etc/di.xml:23:5): `X` may be declared by a base keylang has not read | 21 |

## Точки входу за видами

`entries` порожній.

## Події

n/a — у знімку немає вузлів `event.*` (тікет 08).

## Чернетки `draft flow --mode algo`

| Тригер | Кроків (разом із тригером) |
|---|---:|
| `quote.Model.QuoteManagement.QuoteManagement.placeOrder` | 45 |
| `quote.Model.QuoteManagement.QuoteManagement.submitQuote` | 119 |

## Золотий список для `quote.Model.QuoteManagement.QuoteManagement.placeOrder`

found **6/6** у чернетці; бракує: нічого.

| ID | У карті | У цій чернетці | В інших чернетках |
|---|---|---|---|
| `quote.Model.QuoteManagement.QuoteManagement.placeOrderRun` | так | так | — |
| `quote.Model.QuoteManagement.QuoteManagement.submitQuote` | так | так | `quote.Model.QuoteManagement.QuoteManagement.submitQuote` |
| `quote.Model.SubmitQuoteValidator.SubmitQuoteValidator.validateQuote` | так | так | `quote.Model.QuoteManagement.QuoteManagement.submitQuote` |
| `quote.Model.SubmitQuoteValidator.SubmitQuoteValidator.validateOrder` | так | так | `quote.Model.QuoteManagement.QuoteManagement.submitQuote` |
| `sales.Model.Service.OrderService.OrderService.place` | так | так | `quote.Model.QuoteManagement.QuoteManagement.submitQuote` |
| `salesrule.Plugin.CouponUsagesIncrement.CouponUsagesIncrement.aroundSubmit` | так | так | — |

| Подія | ID у знімку | У чернетці |
|---|---|---|
| `checkout_submit_before` | n/a (тікет 08) | — |
| `checkout_submit_all_after` | n/a (тікет 08) | — |

## Цього запуску

Змінюється між запусками; решта звіту — ні.

| Що | Значення |
|---|---|
| Дата | 2026-10-08 |
| keylang | `c4e2a8f` |
| Node | v24.20.0 |
| Клон | `/home/kosmodev/.cache/keylang/bench/magento2` (`git describe`: `2.4.9`) |
| `map` без кешу фактів (`node --max-old-space-size=4096`) | 15.3 с, maxRSS 695 МБ |
| `check --format json` | 4.5 с, maxRSS 461 МБ |
| Підсумок `map` | 2141 file(s), 2656 module(s), 7099 fn, 276 type(s), 3241 dep(s); calls 5962 resolved, 2706 external, 13352 dynamic, 5683 unresolved; 2327 unresolved import(s); 3 file(s) outside any layer |
| snapshotId | `c0943fb4508dc85f9544148043ab7f77f7baef2f2c5bfe3acb94037542679084` |
