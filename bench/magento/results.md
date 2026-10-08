# Бенч Magento: базова лінія business-flows

[magento/magento2](https://github.com/magento/magento2) тег `2.4.9` (коміт `755e34dd`), sparse-checkout: модулі `Checkout`, `Quote`, `Sales`, `SalesRule`, `Payment` як шари, `lib/internal/Magento/Framework/{App,Event,Model,Api}` як `outside`, `exclude: ["**/Test/**"]`.

Як відтворити: `node bench/magento/run.mjs [--repo <клон>]` — див. [README](README.md). Цей файл пише бенч; змінюється тільки блок «Цього запуску».

`check --format json`: 985 fail, 0 unverified, 0 ok, 0 warning; записів coverage 14050. `map`: 2327 попереджень.

`draft flow quote.Model.QuoteManagement.QuoteManagement.placeOrder --mode algo --print`: кроків 83 (разом із тригером).
`draft flow quote.Model.QuoteManagement.QuoteManagement.submitQuote --mode algo --print`: кроків 221 (разом із тригером).

## Розмір

| Файли | Модулі | fn | Типи | Залежності | Нерозв'язані імпорти |
|---:|---:|---:|---:|---:|---:|
| 2141 | 2656 | 7099 | 276 | 3426 | 2327 |

## Виклики

Розв'язано **47.0 %** (12317 з 26230; ціль spec §6 — ≥ 60 %).

| resolved | external | dynamic | unresolved |
|---:|---:|---:|---:|
| 12317 | 2795 | 8371 | 2747 |

## Дірки за видами

| Вид | Кількість |
|---|---:|
| `dynamic-call` | 8367 |
| `unresolved-call` | 2747 |
| `unresolved-import` | 2327 |
| `outside-file` | 508 |
| `skipped-file` | 42 |
| `unresolved-binding` | 28 |
| `dynamic-event` | 12 |
| `unsupported` | 12 |
| `ambiguous-binding` | 4 |
| `unassigned-file` | 3 |

## Дірки за причинами (top-10 з 13453)

Імена в зворотних лапках зведено до `X`.

| # | Причина | Кількість |
|---:|---|---:|
| 1 | dynamic-call: call through a local value `X` | 3985 |
| 2 | unresolved-call: unresolved call `X` | 2726 |
| 3 | dynamic-call: call through an expression `X` | 2490 |
| 4 | unresolved-import: unresolved import `X` | 2327 |
| 5 | dynamic-call: call through an interface `X` | 651 |
| 6 | dynamic-call: call through `X` of a function value `X` | 641 |
| 7 | dynamic-call: call through `X` of `X` | 329 |
| 8 | dynamic-call: bound to opaque `X` by `X` (app/code/Magento/Quote/etc/di.xml:18:5): `X` may be declared by a base keylang has not read | 62 |
| 9 | dynamic-call: bound to opaque `X` by `X` (app/code/Magento/Quote/etc/di.xml:16:5): `X` may be declared by a base keylang has not read | 58 |
| 10 | dynamic-call: bound to opaque `X` by `X` (app/code/Magento/Sales/etc/di.xml:23:5): `X` may be declared by a base keylang has not read | 25 |

## Точки входу за видами

| Вид | Кількість |
|---|---:|
| `consumer` | 3 |
| `cron` | 15 |
| `observer` | 58 |
| `rest` | 133 |
| `route` | 186 |

## Події

110 вузлів: `events.admin_sales_order_address_update`, `events.adminhtml_sales_order_create_process_data`, `events.adminhtml_sales_order_creditmemo_register_before`, `events.catalog_entity_attribute_delete_after`, `events.catalog_entity_attribute_save_after`, `events.catalog_product_delete_before`, `events.catalog_product_save_after`, `events.catalogrule_after_apply`, `events.catalogrule_before_apply`, `events.checkout_allow_guest`, `events.checkout_cart_add_product_complete`, `events.checkout_cart_product_add_after`, `events.checkout_cart_product_add_before`, `events.checkout_cart_product_update_after`, `events.checkout_cart_save_after`, `events.checkout_cart_save_before`, `events.checkout_cart_update_item_complete`, `events.checkout_cart_update_items_after`, `events.checkout_cart_update_items_before`, `events.checkout_controller_onepage_saveOrder`, `events.checkout_onepage_controller_success_action`, `events.checkout_quote_destroy`, `events.checkout_quote_init`, `events.checkout_submit_all_after`, `events.checkout_submit_before`, `events.checkout_type_onepage_save_order_after`, `events.config_data_dev_grid_async_indexing_disabled`, `events.config_data_sales_email_general_async_sending_disabled`, `events.controller_action_predispatch_checkout_index_index`, `events.custom_quote_process`, `events.customer_address_format`, `events.customer_login`, `events.customer_logout`, `events.customer_save_after_data_object`, `events.email_creditmemo_comment_set_template_vars_before`, `events.email_creditmemo_set_template_vars_before`, `events.email_invoice_comment_set_template_vars_before`, `events.email_invoice_set_template_vars_before`, `events.email_order_comment_set_template_vars_before`, `events.email_order_set_template_vars_before`, `events.email_shipment_comment_set_template_vars_before`, `events.email_shipment_set_template_vars_before`, `events.items_additional_data`, `events.load_customer_quote_before`, `events.magento_catalogrule_api_data_ruleinterface_save_after`, `events.magento_salesrule_api_data_ruleinterface_delete_after`, `events.magento_salesrule_api_data_ruleinterface_delete_before`, `events.magento_salesrule_api_data_ruleinterface_load_after`, `events.magento_salesrule_api_data_ruleinterface_save_after`, `events.magento_salesrule_api_data_ruleinterface_save_before`, `events.order_cancel_after`, `events.payment_cart_collect_items_and_amounts`, `events.payment_method_assign_data`, `events.payment_method_is_active`, `events.prepare_catalog_product_collection_prices`, `events.restore_quote`, `events.rss_order_new_collection_select`, `events.sales_convert_order_item_to_quote_item`, `events.sales_convert_order_to_quote`, `events.sales_convert_quote_to_order`, `events.sales_model_service_quote_submit_before`, `events.sales_model_service_quote_submit_failure`, `events.sales_model_service_quote_submit_success`, `events.sales_order_creditmemo_delete_after`, `events.sales_order_creditmemo_process_relation`, `events.sales_order_creditmemo_refund`, `events.sales_order_customer_assign_after`, `events.sales_order_delete_after`, `events.sales_order_invoice_cancel`, `events.sales_order_invoice_delete_after`, `events.sales_order_invoice_pay`, `events.sales_order_invoice_process_relation`, `events.sales_order_invoice_register`, `events.sales_order_item_cancel`, `events.sales_order_payment_cancel`, `events.sales_order_payment_cancel_creditmemo`, `events.sales_order_payment_cancel_invoice`, `events.sales_order_payment_capture`, `events.sales_order_payment_pay`, `events.sales_order_payment_place_end`, `events.sales_order_payment_place_start`, `events.sales_order_payment_refund`, `events.sales_order_payment_void`, `events.sales_order_place_after`, `events.sales_order_place_before`, `events.sales_order_process_relation`, `events.sales_order_save_after`, `events.sales_order_save_before`, `events.sales_order_shipment_delete_after`, `events.sales_order_shipment_process_relation`, `events.sales_order_state_change_before`, `events.sales_order_status_unassign`, `events.sales_quote_add_item`, `events.sales_quote_address_collect_totals_after`, `events.sales_quote_address_collect_totals_before`, `events.sales_quote_address_discount_item`, `events.sales_quote_collect_totals_after`, `events.sales_quote_collect_totals_before`, `events.sales_quote_item_collection_products_after_load`, `events.sales_quote_item_qty_set_after`, `events.sales_quote_item_set_product`, `events.sales_quote_product_add_after`, `events.sales_quote_remove_item`, `events.sales_quote_save_after`, `events.sales_sale_collection_query_before`, `events.salesrule_rule_condition_combine`, `events.salesrule_rule_delete_commit_after`, `events.salesrule_rule_save_commit_after`, `events.salesrule_validator_process`, `events.store_add`.

## Чернетки `draft flow --mode algo`

| Тригер | Кроків (разом із тригером) |
|---|---:|
| `quote.Model.QuoteManagement.QuoteManagement.placeOrder` | 83 |
| `quote.Model.QuoteManagement.QuoteManagement.submitQuote` | 221 |

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
| `events.checkout_submit_before` | `events.checkout_submit_before` | так |
| `events.checkout_submit_all_after` | `events.checkout_submit_all_after` | так |

## Цього запуску

Змінюється між запусками; решта звіту — ні.

| Що | Значення |
|---|---|
| Дата | 2026-10-08 |
| keylang | `3d7fdfd` |
| Node | v24.20.0 |
| Клон | `/home/kosmodev/.cache/keylang/bench/magento2` (`git describe`: `2.4.9`) |
| `map` без кешу фактів (`node --max-old-space-size=4096`) | 10.7 с, maxRSS 678 МБ |
| `check --format json` | 2.9 с, maxRSS 482 МБ |
| Підсумок `map` | 2141 file(s), 2656 module(s), 7099 fn, 276 type(s), 3426 dep(s); calls 12317 resolved, 2795 external, 8371 dynamic, 2747 unresolved; 2327 unresolved import(s); 3 file(s) outside any layer |
| snapshotId | `1f7980f0c9f11a46241496c865805af17efc94d0c3e15c0aee396ad9351bdeda` |
