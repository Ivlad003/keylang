# 14: Інвентар інтеграцій: вихідні HTTP/SDK, вхідні вебхуки, черги

**Status:** resolved

**Type:** code

**Blocked by:** 09

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Для магазину з десятками інтеграцій це перше, що треба знати перед міграцією.

- Вихідні: виклики відомих клієнтів — PHP (Guzzle, `Magento\Framework\HTTP\Client\Curl`, `curl_*`, SOAP), JS/TS (`fetch`, axios, SDK-пакети: stripe, paypal, aws-sdk…), Python (requests, httpx) — список у даних, не в коді (`resources/integrations.json`). Для літерального URL — хост у мітці.
- Вхідні: точки входу виду `webhook` (маршрути з назвою/шляхом callback/webhook/notify + явна конфігурація `integrations.webhooks` у `keylang.json`).
- Черги: publisher/consumer пари.
- `keylang integrations [--json]` і розділ у `tour` (15): інтеграція → де викликається → з яких флоу.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [x] фікстури на PHP і TS; хост з літерала; нелітеральний URL — «динамічний» (одна фікстура TS + Python + PHP у `tests/integrations.test.ts`: `fetch`, axios, Stripe, requests, Guzzle, `curl_init`, Celery; `dynamic URL` для виразу, `url n/a` без аргументу-URL)
- [x] на бенчі Magento видно платіжні й податкові клієнти модулів, що є у вибірці — частково, див. коментар: на п'яти модулях видно клієнт платіжного шлюзу (`GatewayCommand::execute` → `placeRequest`), SOAP-клієнт `Payment\Gateway\Http\Client\Soap`, імпорти Laminas/Magento HTTP у `Client\Zend` і видавця черги `sales_rule.codegenerator`; податкових клієнтів у вибірці немає (модуля Tax у ній немає). Точки входу, що до них доходять, з'являться з тікетом 10
- [x] docs (`cli.md`, `mcp-lsp.md`, `tui.md`, `semantics.md`, `CONTEXT.md`, `--help`, `llm.txt`)

**Межі:** без мережевих перевірок інтеграцій.

## Comments

### Реалізація (2026-10-08)

- `keylang integrations [--json]` — представлення (ADR 0014), мережі не торкається, код 0; пише лише кеш фактів. **outgoing**: виклики клієнтів із `resources/integrations.json` (дані, не код; той самий матчер, що в `data-logic.json` тікета 13: `callees`/`imports`+`methods`/`receivers`/`languages`), за інтеграцією → місце (`файл:рядок`, fn, хост) → точки входу, чиї розв'язані виклики доходять до fn, з написаним потоком або тим, що дав би `flows discover`; плюс імпорти клієнта (`imported only:`, коли виклик іде через значення, якого keylang не відстежує). **incoming webhooks**: точки входу виду `webhook`, маршрути з `webhook|callback|notify|ipn` у шляху, глоби `integrations.webhooks` у `keylang.json` (файл/шлях точки входу або експортована fn без викликачів у файлі під глобом). Поле валідується в `src/config.ts`: масив глобів, помилка називає `integrations.webhooks`. **queues**: видавці з літеральною темою, споживачі (`consumer`), пари тема = мітка споживача.
- **Аргументи.** Екстрактори аргументів не записують (і в цій зміні не правились), тож хост читається з тексту коду в місці виклику (`src/call-sites.ts`, `urlOf`): URL-літерал або літеральний префікс серед перших двох аргументів → хост; вираз → `dynamic`; інакше `n/a`. Записано в `notes` звіту.
- Операція `integrations` (`src/operations/integrations.ts`, ядро `src/integrations.ts`), MCP `list_integrations` (лише читання), дія TUI «Integrations» зі звітом у F6.
- Розділ у `tour` — тікет 15; пари черг на реальному Magento — після тікета 10 (споживачі з `queue_consumer.xml`).
- Бенч Magento (5 модулів, сьогодні): 5 інтеграцій, 4 місця; ≈ 8 с разом з аналізом (load average ≈ 34).

