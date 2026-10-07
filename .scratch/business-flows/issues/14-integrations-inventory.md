# 14: Інвентар інтеграцій: вихідні HTTP/SDK, вхідні вебхуки, черги

**Status:** ready-for-agent

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

- [ ] фікстури на PHP і TS; хост з літерала; нелітеральний URL — «динамічний»
- [ ] на бенчі Magento видно платіжні й податкові клієнти модулів, що є у вибірці
- [ ] docs

**Межі:** без мережевих перевірок інтеграцій.

## Comments
