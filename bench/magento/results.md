# Бенч Magento: базова лінія business-flows

[magento/magento2](https://github.com/magento/magento2) тег `2.4.9` (коміт `755e34dd`), sparse-checkout: модулі `Checkout`, `Quote`, `Sales`, `SalesRule`, `Payment` як шари, `lib/internal/Magento/Framework/{App,Event,Model,Api}` як `outside`, `exclude: ["**/Test/**"]`.

Як відтворити: `node bench/magento/run.mjs [--repo <клон>]` — див. [README](README.md). Цей файл пише бенч; змінюється тільки блок «Цього запуску».

`check --format json`: 0 fail, 0 unverified, 0 ok, 0 warning; записів coverage 22996. `map`: 2327 попереджень.

`draft flow quote.Model.QuoteManagement.QuoteManagement.placeOrder --mode algo --print`: кроків 1 (разом із тригером).
`draft flow quote.Model.QuoteManagement.QuoteManagement.submitQuote --mode algo --print`: кроків 68 (разом із тригером).

## Розмір

| Файли | Модулі | fn | Типи | Залежності | Нерозв'язані імпорти |
|---:|---:|---:|---:|---:|---:|
| 2141 | 2656 | 7099 | 276 | 3241 | 2327 |

## Виклики

Розв'язано **17.7 %** (4892 з 27703; ціль spec §6 — ≥ 60 %).

| resolved | external | dynamic | unresolved |
|---:|---:|---:|---:|
| 4892 | 2707 | 14417 | 5687 |

## Дірки за видами

| Вид | Кількість |
|---|---:|
| `dynamic-call` | 14417 |
| `unresolved-call` | 5687 |
| `unresolved-import` | 2327 |
| `outside-file` | 508 |
| `skipped-file` | 42 |
| `unsupported` | 12 |
| `unassigned-file` | 3 |

## Дірки за причинами (top-10 з 22443)

Імена в зворотних лапках зведено до `X`.

| # | Причина | Кількість |
|---:|---|---:|
| 1 | dynamic-call: call through a local value `X` | 7625 |
| 2 | unresolved-call: unresolved call `X` | 5687 |
| 3 | dynamic-call: call through an expression `X` | 4066 |
| 4 | unresolved-import: unresolved import `X` | 2327 |
| 5 | dynamic-call: call through an interface `X` | 1323 |
| 6 | dynamic-call: call through `X` of a function value `X` | 950 |
| 7 | dynamic-call: call through `X` of `X` | 453 |
| 8 | unsupported: ambiguous property type `X`: `X`, assigned `X` in the constructor | 9 |
| 9 | unsupported: an include of a path computed at run time | 2 |
| 10 | unsupported: `X` calls a callable chosen at run time | 1 |

## Точки входу за видами

n/a — у знімку немає `entries` (тікет 09).

## Події

n/a — у знімку немає вузлів `event.*` (тікет 08).

## Чернетки `draft flow --mode algo`

| Тригер | Кроків (разом із тригером) |
|---|---:|
| `quote.Model.QuoteManagement.QuoteManagement.placeOrder` | 1 |
| `quote.Model.QuoteManagement.QuoteManagement.submitQuote` | 68 |

## Золотий список для `quote.Model.QuoteManagement.QuoteManagement.placeOrder`

found **0/5** у чернетці; бракує: `quote.Model.QuoteManagement.QuoteManagement.placeOrderRun`, `quote.Model.QuoteManagement.QuoteManagement.submitQuote`, `quote.Model.SubmitQuoteValidator.SubmitQuoteValidator.validateQuote`, `quote.Model.SubmitQuoteValidator.SubmitQuoteValidator.validateOrder`, `sales.Model.Service.OrderService.OrderService.place`.

| ID | У карті | У цій чернетці | В інших чернетках |
|---|---|---|---|
| `quote.Model.QuoteManagement.QuoteManagement.placeOrderRun` | так | — | — |
| `quote.Model.QuoteManagement.QuoteManagement.submitQuote` | так | — | `quote.Model.QuoteManagement.QuoteManagement.submitQuote` |
| `quote.Model.SubmitQuoteValidator.SubmitQuoteValidator.validateQuote` | так | — | `quote.Model.QuoteManagement.QuoteManagement.submitQuote` |
| `quote.Model.SubmitQuoteValidator.SubmitQuoteValidator.validateOrder` | так | — | `quote.Model.QuoteManagement.QuoteManagement.submitQuote` |
| `sales.Model.Service.OrderService.OrderService.place` | так | — | — |

| Подія | ID у знімку | У чернетці |
|---|---|---|
| `checkout_submit_before` | n/a (тікет 08) | — |
| `checkout_submit_all_after` | n/a (тікет 08) | — |

## Цього запуску

Змінюється між запусками; решта звіту — ні.

| Що | Значення |
|---|---|
| Дата | 2026-10-07 |
| keylang | `661886b` |
| Node | v24.20.0 |
| Клон | `/home/kosmodev/.cache/keylang/bench/magento2` (`git describe`: `2.4.9`) |
| `map` без кешу фактів (`node --max-old-space-size=4096`) | 5.8 с, maxRSS 705 МБ |
| `check --format json` | 1.8 с, maxRSS 444 МБ |
| Підсумок `map` | 2141 file(s), 2656 module(s), 7099 fn, 276 type(s), 3241 dep(s); calls 4892 resolved, 2707 external, 14417 dynamic, 5687 unresolved; 2327 unresolved import(s); 3 file(s) outside any layer |
| snapshotId | `94e6c11c8fcd42b62e808d08e14a34c90c415fe6ea6d1ccc03ef10a81574eab1` |
