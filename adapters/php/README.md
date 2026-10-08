# Адаптер trace для PHP

`keylang_trace.php` записує виклики функцій плану як JSONL схеми 1 ([semantics.md](../../docs/semantics.md), «Trace»). Один файл без залежностей; PHP 8.1+ з tokenizer, OPcache вимкнений там, де адаптер записує. `keylang_phpunit.php` — розширення PHPUnit 10+, що пише звіт тестів keylang і називає кожен тест запуском trace. Повний опис — [cli.md](../../docs/cli.md#trace).

## План

```sh
keylang trace-plan checkout > plan.json                                     # потік, що вже є
keylang trace-plan --entry <id> --name checkout > plan.json                 # точка входу без потоку
```

`--entry` бере fn, досяжні з точки входу, і розширює план там, де keylang не розв'язав виклик (DI, `$x->method()` на нетипізованому значенні): fn з тим самим іменем потрапляють у план, і trace покаже, яка з них справді виконалась.

## Скрипт, тести, інтеграційні тести Magento

```sh
KEYLANG_TRACE=.keylang/trace/checkout.jsonl KEYLANG_TRACE_PLAN=plan.json KEYLANG_TRACE_TEST="run.php" \
  php adapters/php/keylang_trace.php run.php
KEYLANG_TRACE=… KEYLANG_TRACE_PLAN=plan.json \
  php -d auto_prepend_file=adapters/php/keylang_trace.php vendor/bin/phpunit -c dev/tests/integration/phpunit.xml
KEYLANG_TRACE=… KEYLANG_TRACE_PLAN=plan.json KEYLANG_FLOW=checkout \
  php -d auto_prepend_file=adapters/php/keylang_trace.php bin/magento some:command
```

`KEYLANG_FLOW` називає потік запуску процесу; без `KEYLANG_TRACE_TEST` ID тесту тоді — командний рядок.

## Запити локального стенду

Як `auto_prepend_file` веб-сервера адаптер пише запит, що назвав потік заголовком або кукою `X-Keylang-Flow: <flow>` (інакше `KEYLANG_FLOW`), як окремий запуск цього потоку з ID тесту `<METHOD> <шлях>`. Запит без назви потоку нічого не пише.

```ini
; пул php-fpm стенду
php_admin_value[auto_prepend_file] = /path/to/keylang/adapters/php/keylang_trace.php
php_admin_value[opcache.enable] = 0
env[KEYLANG_TRACE] = /repo/.keylang/trace/checkout.jsonl
env[KEYLANG_TRACE_PLAN] = /repo/.keylang/trace/checkout-plan.json
env[KEYLANG_TRACE_ROOT] = /repo
```

У браузері: `document.cookie = "X-Keylang-Flow=checkout; path=/"` у консолі DevTools (або заголовок розширенням на кшталт ModHeader), пройти оформлення замовлення, прибрати куку. Далі:

```sh
keylang draft flow --from-trace .keylang/trace/checkout.jsonl --run <runId>
```

пропонує потік зі спостережених викликів; крок, якого static не бачить, позначено `<!-- keylang:trace via observed -->`. Покроково — рецепт «записати флоу оформлення замовлення з браузера» в [cli.md](../../docs/cli.md#trace-requests).
