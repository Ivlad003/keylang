# Бізнес-флоу: знайти всі, показати діаграмою, перенести на інший стек

**Статус:** spec · **Джерела:** [рев'ю 2026-10-06](../../docs/review-2026-10-06.md) §1, §3; перевірка на Magento 2026-10-07 (нижче); [ADR 0009](../../docs/adr/0009-flow-properties-ltlf.md), [ADR 0014](../../docs/adr/0014-one-model-many-views.md), [ADR 0017](../../docs/adr/0017-assume-unread-imports.md).

## 1. Навіщо

keylang має допомагати швидко зануритись у чужий проєкт: знайти **всі** бізнес-процеси (оформлення замовлення, оплата, повернення, синхронізації з ERP), побачити їх діаграмою, зрозуміти специфіку реалізації, а потім перенести бізнес-логіку на інший стек (кейс: Magento / Adobe Commerce → Salesforce Commerce) або спроєктувати новий проєкт з діаграми й віддати реалізацію агентам.

## 2. Що показала перевірка на Magento (2026-10-07)

Модулі Checkout, Quote, Sales, SalesRule, Payment з `magento/magento2` (1645 PHP-файлів, без `Test/`), шар на модуль:

| Метрика | Значення |
|---|---|
| `map` / `check` | 5,3 с, 610 МБ / 1,7 с |
| вузли / ребра імпорту | 2058 модулів, 7162 fn / 3236 |
| виклики | розв'язано **4278**; динамічних **17 176**, нерозв'язаних 3878 → видно ≈ 1 з 5 |
| правила між модулями | працюють: 17 реальних K102 |
| `draft flow …QuoteManagement.placeOrder` | **порожній**: вся робота в `$this->cartMutex->execute(fn …)` |
| `draft flow …submitQuote` | 20 кроків — лише гетери `Quote`; немає `orderManagement->place`, валідаторів, конвертерів, `quoteRepository->save`, подій |
| логіка в XML, яку keylang не читає | 69 plugins, 213 preferences, 57 observers, 15 cron, 3 queue consumers, 133 webapi-маршрути |

Висновок: на DI-фреймворках граф викликів без конфігурації фреймворку майже порожній, а точок входу keylang не знає взагалі. Це головний блокер мети §1.

## 3. Принципи (не змінюються)

- Факт — лише те, що записано в коді **або в конфігурації фреймворку, яку фреймворк виконує** (`di.xml`, `events.xml`, `routes.xml`…). Кожне ребро з такого джерела має походження (`via: preference`, `via: plugin`, `via: observer`…) і позицію в XML. Нічого не вгадується з імен.
- Чого не прочитано — дірка з причиною, а не відсутність. Три вердикти лишаються.
- Діаграма — представлення (ADR 0014): `check` її не читає. Зміна на діаграмі стає **пропозицією** і доходить до файлів лише через MERGE / `proposals accept`.
- Модель лише пропонує (назви процесів, описи, відповідність ID), вердикт від неї не залежить.

## 3a. Рішення автора (2026-10-07)

- Конфіги фреймворку — факти знімка (manifest, `snapshotId`); ребра — `call` з `via`; `deny` бачить DI-ребра (належать модулю конфігу); адаптер вмикається автоматично, `frameworks` у `keylang.json` перевизначає.
- **business-flows — для всіх мов, які є в проєкті** (TS/JS, Python, Rust, PHP і їхня суміш): граф, точки входу, `flows discover`, звіти, діаграми й міграція мовно-незалежні; адаптери фреймворків — по одному на фреймворк, Magento — перший.
- Асинхронне продовження — окремі флоу з `continues`.
- Редактор діаграм — maxGraph; розкладка — `keylang/diagrams/` у git.
- Перший пріоритет — Magento-гілка: 01 → 04 (+05) → 06–10 → 11.

## 4. Архітектура рішення

1. **Адаптери фреймворків** (новий шар фактів поруч із мовними фронтендами): читають конфіги, дають (а) **прив'язки** інтерфейс→реалізація, (б) **перехоплення** (plugins/decorators/middleware), (в) **події** (dispatch → event → subscribers), (г) **точки входу** (HTTP-маршрути, REST/GraphQL, cron, consumers черг, консольні команди, observers, вебхуки). ADR — тікет 01.
2. **Граф** використовує прив'язки для викликів через інтерфейс і closure, передані аргументом (04–05); Magento-адаптер — 06–08, 10; точки входу — 09.
3. **Відкриття флоу:** `keylang entries` (09) → `keylang flows discover` (11) робить чернетку флоу для кожної точки входу, модель дає бізнес-назву й групує в процеси (12), звіт сліпих зон (13), інвентар інтеграцій (14), онбординг-бриф `keylang tour` (15); trace на реальних запитах (19).
4. **Мова:** події, паралельні групи, асинхронні тригери й таймери (ADR 02, тікети 16–18).
5. **Веб:** API моделі діаграм → перегляд флоу → дослідник точок входу → редактор у стилі diagrams.net на maxGraph → зміни як пропозиції → копіювання між вкладками/проєктами → експорт BPMN/draw.io → проєкт з нуля (20–25, 28–29).
6. **Міграція:** переносний пакет флоу, таблиця відповідності ID, паритет через спільні тести (26–27).
7. **Цільові стеки:** SFCC/SFRA (30), інші фреймворки (31).

## 5. Порядок і критичний шлях

- Спершу (рішення автора): Magento-гілка — 01 (оформити ADR за рішеннями §3a) → 03 (базова лінія) → 04, 05, 09 → 06, 07, 08, 10. Паралельно 02.
- Критичний шлях до мети «знайти всі флоу Magento»: 01 → 32, 05, 09 → 04 → 06, 07, 08, 10 → 11 → 12, 13, 14 → 15 (після рев'ю плану, §9).
- Веб-гілка (20 → 33 → 21 → 23a–d → 24 → 25/29) незалежна від Magento і може йти паралельно.
- З рев'ю 2026-10-06 до цієї мети найдотичніші тікети `review-2026-10-06` 10, 16, 17, 23–25, 38–40 (Python/PHP/trace).

## 6. Критерії успіху фічі (вимірює тікет 03)

На тих самих п'яти модулях Magento:
- частка розв'язаних викликів ≥ 60 % (зараз ≈ 17 %), решта — дірки з причиною;
- `keylang entries` знаходить ≥ 95 % маршрутів webapi.xml, усі cron-задачі, consumers і observers;
- флоу `placeOrder` містить `placeOrderRun`, `submitQuote`, `SubmitQuoteValidator::validateQuote`, `OrderManagementInterface::place` (через preference), обидві події `checkout_submit_*` з їхніми observers і plugins на `placeOrder`;
- `flows discover` + `tour` дають новій людині за ≤ 10 хв список бізнес-процесів з описами й діаграмами.

## 7. Поза обсягом

Повна BPMN-семантика (компенсації, ескалації, складні шлюзи), виконання процесів, читання БД/налаштувань адмінки (price rules, EAV) — лише позначаються як «логіка в даних» у звіті сліпих зон.

## 8. Тікети

| # | Тікет | Статус | Blocked by |
|---|---|---|---|
| [01](issues/01-adr-framework-facts.md) | ADR: факти фреймворків — прив'язки, перехоплення, події й точки входу | resolved | — |
| [02](issues/02-adr-async-flows.md) | ADR: асинхронні флоу — події, паралельні групи, асинхронні тригери, таймери | resolved | — |
| [03](issues/03-magento-bench-baseline.md) | Бенч на Magento: базова лінія й метрики успіху | resolved | — |
| [04](issues/04-binding-calls.md) | Граф: виклик через інтерфейс за прив'язкою з адаптера | resolved | 01, 32 |
| [05](issues/05-closure-arg-calls.md) | Граф і draft: callable-посилання й closure, передані аргументом (`cartMutex->execute(\Closure::fromCallable([$this, 'placeOrderRun']))`) | resolved | 01 |
| [06](issues/06-magento-di-bindings.md) | Magento: `di.xml` (preference, type arguments, virtualType) → прив'язки | resolved | 04 |
| [07](issues/07-magento-plugins.md) | Magento: plugins (before/around/after) як перехоплення викликів | resolved | 04 |
| [08](issues/08-magento-events.md) | Magento: `events.xml` і `dispatch()` → події та підписники | ready-for-agent | 01, 09 |
| [09](issues/09-entries-snapshot.md) | Знімок: точки входу як факти й команда `keylang entries` | resolved | 01 |
| [10](issues/10-magento-entries.md) | Magento: точки входу — routes/controllers, webapi, GraphQL, cron, queue, console | ready-for-agent | 06, 09 |
| [11](issues/11-flows-discover.md) | `keylang flows discover`: чернетка флоу для кожної точки входу | resolved | 09 |
| [12](issues/12-flows-business-names.md) | Бізнес-назви, описи й групування флоу в процеси (модель) | resolved | 11 |
| [13](issues/13-blind-spots-report.md) | Звіт покриття: сліпі зони, сироти, «логіка в даних» | resolved | 09, 11 |
| [14](issues/14-integrations-inventory.md) | Інвентар інтеграцій: вихідні HTTP/SDK, вхідні вебхуки, черги | resolved | 09 |
| [15](issues/15-project-tour.md) | `keylang tour`: онбординг-бриф проєкту за 10 хвилин | ready-for-agent | 12, 13, 14 |
| [16](issues/16-grammar-events.md) | Мова: `trigger event`, перевірка `emits event` проти фактів | ready-for-agent | 02, 08 |
| [17](issues/17-grammar-parallel.md) | Мова: паралельні групи кроків `parallel` | resolved | 02 |
| [18](issues/18-grammar-async-triggers.md) | Мова: асинхронні тригери (route/cron/consumer/webhook), `continues`, таймери | resolved | 02, 09 |
| [19](issues/19-php-trace-real-requests.md) | Trace на реальних запитах і інтеграційних тестах (PHP/Magento, TS, Python, Rust) | resolved | 09 |
| [20](issues/20-web-diagram-model.md) | Web: API моделі діаграм (флоу, точки входу, події, шари) з розкладкою | resolved | — |
| [21](issues/21-web-flow-viewer.md) | Web: перегляд флоу як діаграми (пошук, вердикти, перехід у код) | resolved | 20, 33 |
| [22](issues/22-web-entry-explorer.md) | Web: дослідник точок входу й подій — інтерактивне дерево викликів | resolved | 09, 20 |
| [23](issues/23-web-diagram-editor.md) | Web-редактор діаграм у стилі diagrams.net (draw.io) | ready-for-agent | 20, 21, 33 |
| [24](issues/24-diagram-to-proposals.md) | Редактор → специфікація: зміни діаграми як пропозиції, файл розкладки | ready-for-agent | 23 |
| [25](issues/25-diagram-copy-paste.md) | Копіювання фрагмента діаграми між вкладками й проєктами | ready-for-agent | 23, 26 |
| [26](issues/26-flow-bundle-export-import.md) | `keylang flow export\|import`: переносний пакет бізнес-флоу | ready-for-agent | 12 |
| [27](issues/27-migration-parity.md) | Міграція: таблиця відповідності ID і перевірка паритету старого й нового стеку | ready-for-agent | 26 |
| [28](issues/28-export-bpmn-drawio.md) | Експорт у BPMN 2.0 і draw.io (.drawio), імпорт .drawio як чернетки | ready-for-agent | 20 |
| [29](issues/29-greenfield-from-diagram.md) | Проєкт з нуля з діаграми: від ідеї до фічі для агентів | ready-for-agent | 24, 25 |
| [30](issues/30-sfcc-sfra-frontend.md) | Цільовий стек: Salesforce Commerce Cloud (SFRA-картриджі, PWA Kit) | ready-for-agent | 01, 09 |
| [31](issues/31-more-framework-adapters.md) | Наступні адаптери фреймворків: Laravel, Symfony, NestJS, Express/Next, Django/FastAPI | ready-for-human | 01, 04, 09 |
| [32](issues/32-php-property-types.md) | PHP: тип властивості з присвоєння в конструкторі та з docblock `@var` | resolved | — |
| [33](issues/33-web-client-build.md) | Веб-клієнт діаграм: збірка (esbuild), каркас SPA, автентифікація API | resolved | 20 |

## 9. Рев'ю плану на реалістичність (2026-10-07)

Перевірено на коді keylang (`45cc74d`) і на вибірці Magento зі scratch. Усі зауваження перенесені у відповідні тікети розділом «Рев'ю плану (2026-10-07)»; тут — зведення.

| # | Проблема | Де | Рішення |
|---|---|---|---|
| 1 | **`placeOrder` — не closure.** Код: `\Closure::fromCallable([$this, 'placeOrderRun'])`. Екстрактор PHP не бачить callable-масивів зовсім (`calls: []` у вузлі), тож тікет 05 у початковій постановці `placeOrder` не відкрив би | 05 | Переписано: callable-посилання (`[$this,'m']`, `'C::m'`, `fromCallable`, `$this->m(...)`, і аналоги TS/Python/Rust) як `valueRef`, аргументом виклику — ребро `via: callable-arg`; closure — другим |
| 2 | **Типи отримувачів у Magento невідомі.** Властивості нетипізовані (`private $x;` + `@var` + присвоєння в конструкторі); екстрактор бере тип лише з типізованої властивості або promoted-параметра (`php.ts:59, :310`). Тому 12,6 тис. викликів — дірки ще до прив'язок, і тікет 04 на Magento майже нічого б не змінив | 04 | Новий тікет **32**: тип із ctor-присвоєння (syntactic) і з docblock `@var` (`provenance: docblock`, видно у вердикті). 04 заблоковано 32 |
| 3 | **Виду вузла `event` у знімку немає** (`snapshot.ts:123`: layer/module/fn/type) — тікет 08 недооцінював обсяг: карта, index, resolve, LSP, zoom | 08 | Підпункт «вид вузла `event`» першим; місце подій — рішення в ADR 0022 |
| 4 | **Сотні пропозицій ніхто не зіллє.** `proposals accept` — одна ціль, «для людини»; а писати discovered-флоу в `keylang/flows/` — роздути «N ok» (ризик §3 №6) | 11 | Discovered-флоу — **представлення** `keylang/flows-discovered/` з маркером generated, `check` не читає; `flows adopt <name>` робить одну пропозицію |
| 5 | **Веб — не SPA.** `keylang web` — inline-HTML з xterm, без бандлера (`copy-web.mjs` лише копіює файли); maxGraph — ESM на багато файлів | 20, 21, 23 | Новий тікет **33**: esbuild у dev, `dist/web/app.js` у prepack, API з Bearer-токеном; 21 і 23 заблоковано 33 |
| 6 | **Тікет 23 — тижні роботи**, не одна зміна shiftwork; e2e потребує браузера | 23 | Розбити на 23a–d; браузерні тести — `npm run test:web`, не в `npm test` |
| 7 | **`npm test` ≈ 15 хв** (1038 тестів), `verifyTimeoutMin: 20`, паралельні зміни дають load 18–40 → таймаути Verify | усі code | У Verify робочої зміни — файли тестів зміни; повний прогін — на review-зміні |
| 8 | **Framework Magento — ще 6–7 тис. файлів**; ≈ 0,1 МБ heap/файл, OOM на 5000 файлах у рев'ю | 03 | Framework через `outside` або вибірково; `--max-old-space-size`, maxRSS як метрика, `--repo <dir>` без мережі |
| 9 | **`deny` на DI-ребрах дасть сотні K102** на brownfield-Magento | 06 | Очікувано; baseline має записувати `via`-ребра, K102 завжди називає `di.xml:рядок` |
| 10 | **Шлях маршруту в граматиці** (`/V1/carts/{id}`) не є ID | 18 | Тригер посилається на стабільний ID точки входу з `entries`; мітка — у вердикті |
| 11 | **Власні MIME у буфері обміну** не працюють між браузерами/origin | 25 | Усе в `text/plain`: Markdown-пакет + блок ```` ```keylang-layout ```` |
| 12 | **Вартість моделі** на 7 тис. fn — мільйони токенів | 12, 15 | Офлайн-перше: docblock-и (Magento має їх скрізь); модель — лише на рівні процесу |
| 13 | **`Call.via`** сьогодні лише `"default" \| "injected"` і означає хуки у `covers()`/`proves()` | 04, 05 | Розширити тип; переглянути `flows.ts:435/496`, щоб нові `via` не рахувались хуками |
| 14 | Тікет 19 залежить від виправлень trace-адаптерів з рев'ю (буфер до exit, fork) | 19 | Blocked by review-2026-10-06/16, 17 |

**Що лишилось непевним:** (а) чи достатньо ctor-присвоєння + `@var`, щоб дійти до 60 % розв'язаних викликів на Magento — перевірить бенч 03 після 32; (б) чи варто для подій робити окремий вид вузла або модуль `events` — рішення ADR 0022; (в) обсяг maxGraph-редактора навіть після розбиття — найбільший ризик фічі за часом.
