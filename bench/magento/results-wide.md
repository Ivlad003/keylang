# Бенч Magento (широкий): business-flows

[magento/magento2](https://github.com/magento/magento2) тег `2.4.9` (коміт `755e34dd`), sparse-checkout `--wide`: модулі `Checkout`, `Quote`, `Sales`, `SalesRule`, `Payment` як шари; решта 217 модулів `app/code/Magento` і весь `lib/internal/Magento/Framework` (без `Test`) як `outside` — лише декларації; `app/etc/di.xml` і `di.xml` усіх модулів читає адаптер Magento; `exclude: ["**/Test/**"]`.

Як відтворити: `node bench/magento/run.mjs --wide [--repo <клон>]` — див. [README](README.md). Цей файл пише бенч; змінюється тільки блок «Цього запуску». Вузький бенч (типовий) — [results.md](results.md).

`check --format json`: 2456 fail, 0 unverified, 0 ok, 0 warning; записів coverage 18565. `map`: 2393 попереджень.

`draft flow quote.Model.QuoteManagement.QuoteManagement.placeOrder --mode algo --print`: кроків 83 (разом із тригером).
`draft flow quote.Model.QuoteManagement.QuoteManagement.submitQuote --mode algo --print`: кроків 221 (разом із тригером).

## Розмір

| Файли | Модулі | fn | Типи | Залежності | Нерозв'язані імпорти |
|---:|---:|---:|---:|---:|---:|
| 13485 | 18607 | 7099 | 276 | 3281 | 2393 |

## Виклики

Розв'язано **72.1 %** (17965 з 24918; ціль spec §6 — ≥ 60 %).

| resolved | external | dynamic | unresolved |
|---:|---:|---:|---:|
| 17965 | 2731 | 4047 | 175 |

## Дірки за видами

| Вид | Кількість |
|---|---:|
| `outside-file` | 11855 |
| `dynamic-call` | 4041 |
| `unresolved-import` | 2393 |
| `unresolved-call` | 175 |
| `skipped-file` | 42 |
| `unresolved-binding` | 31 |
| `dynamic-event` | 12 |
| `unsupported` | 10 |
| `ambiguous-binding` | 6 |

## Дірки за причинами (top-10 з 6619)

Імена в зворотних лапках зведено до `X`.

| # | Причина | Кількість |
|---:|---|---:|
| 1 | unresolved-import: unresolved import `X` | 2393 |
| 2 | dynamic-call: call through a local value `X` | 1760 |
| 3 | dynamic-call: call through an interface `X` | 988 |
| 4 | dynamic-call: call through an expression `X` | 978 |
| 5 | unresolved-call: unresolved call `X` | 152 |
| 6 | dynamic-call: bound to opaque `X` by `X` (app/code/Magento/Quote/etc/di.xml:18:5): `X` may be declared by a base keylang has not read | 62 |
| 7 | dynamic-call: bound to opaque `X` by `X` (app/code/Magento/Quote/etc/di.xml:16:5): `X` may be declared by a base keylang has not read | 58 |
| 8 | dynamic-call: call through `X` of a function value `X` | 40 |
| 9 | dynamic-call: bound to opaque `X` by `X` (app/code/Magento/Sales/etc/di.xml:23:5): `X` may be declared by a base keylang has not read | 25 |
| 10 | dynamic-call: bound to opaque `X` by `X` (app/code/Magento/Sales/etc/di.xml:17:5): `X` may be declared by a base keylang has not read | 19 |

## Точки входу за видами

| Вид | Кількість |
|---|---:|
| `consumer` | 3 |
| `cron` | 15 |
| `observer` | 58 |
| `rest` | 133 |
| `route` | 186 |

## Події

121 вузлів: `events.admin_sales_order_address_update`, `events.adminhtml_block_promo_widget_chooser_prepare_collection`, `events.adminhtml_block_salesrule_actions_prepareform`, `events.adminhtml_controller_salesrule_prepare_save`, `events.adminhtml_customer_orders_add_action_renderer`, `events.adminhtml_promo_quote_edit_tab_coupons_form_prepare_form`, `events.adminhtml_sales_order_create_process_data`, `events.adminhtml_sales_order_create_process_data_before`, `events.adminhtml_sales_order_create_process_item_after`, `events.adminhtml_sales_order_create_process_item_before`, `events.adminhtml_sales_order_creditmemo_register_before`, `events.catalog_entity_attribute_delete_after`, `events.catalog_entity_attribute_save_after`, `events.catalog_product_delete_before`, `events.catalog_product_save_after`, `events.catalogrule_after_apply`, `events.catalogrule_before_apply`, `events.checkout_allow_guest`, `events.checkout_cart_add_product_complete`, `events.checkout_cart_product_add_after`, `events.checkout_cart_product_add_before`, `events.checkout_cart_product_update_after`, `events.checkout_cart_save_after`, `events.checkout_cart_save_before`, `events.checkout_cart_update_item_complete`, `events.checkout_cart_update_items_after`, `events.checkout_cart_update_items_before`, `events.checkout_controller_onepage_saveOrder`, `events.checkout_onepage_controller_success_action`, `events.checkout_quote_destroy`, `events.checkout_quote_init`, `events.checkout_submit_all_after`, `events.checkout_submit_before`, `events.checkout_type_onepage_save_order_after`, `events.config_data_dev_grid_async_indexing_disabled`, `events.config_data_sales_email_general_async_sending_disabled`, `events.controller_action_predispatch_checkout_index_index`, `events.custom_quote_process`, `events.customer_address_format`, `events.customer_login`, `events.customer_logout`, `events.customer_save_after_data_object`, `events.email_creditmemo_comment_set_template_vars_before`, `events.email_creditmemo_set_template_vars_before`, `events.email_invoice_comment_set_template_vars_before`, `events.email_invoice_set_template_vars_before`, `events.email_order_comment_set_template_vars_before`, `events.email_order_set_template_vars_before`, `events.email_shipment_comment_set_template_vars_before`, `events.email_shipment_set_template_vars_before`, `events.items_additional_data`, `events.load_customer_quote_before`, `events.magento_catalogrule_api_data_ruleinterface_save_after`, `events.magento_salesrule_api_data_ruleinterface_delete_after`, `events.magento_salesrule_api_data_ruleinterface_delete_before`, `events.magento_salesrule_api_data_ruleinterface_load_after`, `events.magento_salesrule_api_data_ruleinterface_save_after`, `events.magento_salesrule_api_data_ruleinterface_save_before`, `events.order_cancel_after`, `events.payment_cart_collect_items_and_amounts`, `events.payment_form_block_to_html_before`, `events.payment_method_assign_data`, `events.payment_method_is_active`, `events.prepare_catalog_product_collection_prices`, `events.restore_quote`, `events.rss_order_new_collection_select`, `events.sales_convert_order_item_to_quote_item`, `events.sales_convert_order_to_quote`, `events.sales_convert_quote_to_order`, `events.sales_model_service_quote_submit_before`, `events.sales_model_service_quote_submit_failure`, `events.sales_model_service_quote_submit_success`, `events.sales_order_creditmemo_delete_after`, `events.sales_order_creditmemo_process_relation`, `events.sales_order_creditmemo_refund`, `events.sales_order_customer_assign_after`, `events.sales_order_delete_after`, `events.sales_order_invoice_cancel`, `events.sales_order_invoice_delete_after`, `events.sales_order_invoice_pay`, `events.sales_order_invoice_process_relation`, `events.sales_order_invoice_register`, `events.sales_order_item_cancel`, `events.sales_order_payment_cancel`, `events.sales_order_payment_cancel_creditmemo`, `events.sales_order_payment_cancel_invoice`, `events.sales_order_payment_capture`, `events.sales_order_payment_pay`, `events.sales_order_payment_place_end`, `events.sales_order_payment_place_start`, `events.sales_order_payment_refund`, `events.sales_order_payment_void`, `events.sales_order_place_after`, `events.sales_order_place_before`, `events.sales_order_process_relation`, `events.sales_order_save_after`, `events.sales_order_save_before`, `events.sales_order_shipment_delete_after`, `events.sales_order_shipment_process_relation`, `events.sales_order_state_change_before`, `events.sales_order_status_unassign`, `events.sales_quote_add_item`, `events.sales_quote_address_collect_totals_after`, `events.sales_quote_address_collect_totals_before`, `events.sales_quote_address_discount_item`, `events.sales_quote_collect_totals_after`, `events.sales_quote_collect_totals_before`, `events.sales_quote_item_collection_products_after_load`, `events.sales_quote_item_qty_set_after`, `events.sales_quote_item_set_product`, `events.sales_quote_product_add_after`, `events.sales_quote_remove_item`, `events.sales_quote_save_after`, `events.sales_sale_collection_query_before`, `events.salesrule_rule_condition_combine`, `events.salesrule_rule_delete_commit_after`, `events.salesrule_rule_get_coupon_types`, `events.salesrule_rule_save_commit_after`, `events.salesrule_validator_process`, `events.shortcut_buttons_container`, `events.store_add`.

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
| Клон | `/home/kosmodev/.cache/keylang/bench/magento2-wide` (`git describe`: `2.4.9`) |
| `map` без кешу фактів (`node --max-old-space-size=8192`) | 53.7 с, maxRSS 1311 МБ |
| `check --format json` | 5.4 с, maxRSS 743 МБ |
| Підсумок `map` | 13485 file(s), 18607 module(s), 7099 fn, 276 type(s), 3281 dep(s); calls 17965 resolved, 2731 external, 4047 dynamic, 175 unresolved; 2393 unresolved import(s) |
| snapshotId | `62a7dca51f1d099a08c6349eb1c1e53a1edd1fa2a72f672b2dd7ba133413fbae` |
